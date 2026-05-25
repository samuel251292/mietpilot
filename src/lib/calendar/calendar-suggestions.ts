import { createTask } from "@/lib/tasks/task-service";
import type { CalendarSuggestion, CaseTask, CaseTaskSource, SavedCaseDocument, SavedCaseRecord } from "@/types/case";

type SuggestionDraft = Omit<CalendarSuggestion, "id" | "suggestedAt">;

const terminalStatuses = new Set(["done", "archived", "dismissed"]);

export function generateCalendarSuggestions(caseRecord: SavedCaseRecord) {
  const suggestedAt = new Date().toISOString();
  const suggestions = [
    ...generateLetterSuggestions(caseRecord),
    ...generateCommunicationSuggestions(caseRecord),
    ...generateDocumentSuggestions(caseRecord),
    ...generateCaseSuggestions(caseRecord),
  ].map((suggestion) => ({
    ...suggestion,
    id: `calendar_suggestion_${stableSlug(getCalendarSuggestionSourceKey(suggestion.source))}`,
    suggestedAt,
  }));

  return uniqueSuggestions(suggestions).filter((suggestion) => !isCalendarSuggestionAlreadyApplied(caseRecord, suggestion));
}

export function applyCalendarSuggestion(caseRecord: SavedCaseRecord, suggestion: CalendarSuggestion) {
  const nextRecord = createTask(caseRecord, {
    title: suggestion.title,
    description: suggestion.description,
    type: suggestion.type,
    priority: suggestion.priority ?? "normal",
    startAt: suggestion.startAt,
    endAt: suggestion.endAt,
    dueAt: suggestion.dueAt ?? suggestion.startAt,
    location: suggestion.location,
    source: suggestion.source as CaseTaskSource,
    appointmentStatus: suggestion.type === "appointment" || suggestion.type === "hearing" || suggestion.type === "visit" ? "planned" : undefined,
    metadata: {
      ...(suggestion.metadata ?? {}),
      calendarSuggestionId: suggestion.id,
      calendarSuggestionReason: suggestion.reason,
      calendarSuggestionKey: getCalendarSuggestionKey(suggestion),
    },
  });

  const [createdActivity, ...rest] = nextRecord.activityLog ?? [];
  if (!createdActivity) return nextRecord;
  return {
    ...nextRecord,
    activityLog: [
      {
        ...createdActivity,
        title: "Termin aus Vorschlag erstellt",
        description: suggestion.reason,
        metadata: {
          ...(createdActivity.metadata ?? {}),
          calendarSuggestionId: suggestion.id,
          calendarSuggestionKey: getCalendarSuggestionKey(suggestion),
          calendarSuggestionReason: suggestion.reason,
        },
      },
      ...rest,
    ],
  };
}

export function applyAllCalendarSuggestions(caseRecord: SavedCaseRecord) {
  return generateCalendarSuggestions(caseRecord).reduce((record, suggestion) => applyCalendarSuggestion(record, suggestion), caseRecord);
}

export function getCalendarSuggestionKey(suggestion: CalendarSuggestion) {
  return getCalendarSuggestionSourceKey(suggestion.source);
}

export function isCalendarSuggestionAlreadyApplied(caseRecord: SavedCaseRecord, suggestion: CalendarSuggestion) {
  const key = getCalendarSuggestionKey(suggestion);
  return (caseRecord.caseTasks ?? []).some((task) => {
    if (terminalStatuses.has(task.status)) return false;
    const taskKey = String(task.metadata?.calendarSuggestionKey ?? "");
    if (taskKey === key || matchesSource(task.source, suggestion.source)) return true;
    return isSimilarCalendarTask(task, suggestion);
  });
}

function generateLetterSuggestions(caseRecord: SavedCaseRecord): SuggestionDraft[] {
  const suggestions: SuggestionDraft[] = [];

  for (const letter of caseRecord.generatedLetters ?? []) {
    const text = letter.letterText ?? caseRecord.letterText ?? "";
    const date = findDateInText(text, ["frist", "zahlung", "rückmeldung", "antwort"]);
    if (date) {
      suggestions.push(buildSuggestion({
        title: "Antwort-/Zahlungsfrist prüfen",
        description: `Frist aus Schreiben Version ${letter.version}.`,
        type: "deadline",
        dueAt: date,
        priority: "high",
        source: source("letter", `letter:${letter.id}:deadline`, `Schreiben Version ${letter.version}`),
        reason: "Im Schreiben wurde eine mögliche Antwort- oder Zahlungsfrist erkannt.",
        metadata: { letterVersionId: letter.id, version: letter.version },
      }));
    }

    if (letter.status === "sent" || letter.sent?.sentAt) {
      suggestions.push(buildSuggestion({
        title: "Rückmeldung zum Schreiben prüfen",
        description: `Follow-up zu Schreiben Version ${letter.version}.`,
        type: "follow_up",
        dueAt: daysAfter(letter.sent?.sentAt ?? new Date().toISOString(), 7),
        priority: "normal",
        source: source("letter", `letter:${letter.id}:sent-follow-up`, `Schreiben Version ${letter.version}`),
        reason: "Schreiben wurde versendet; Rückmeldung in 7 Tagen prüfen.",
        metadata: { letterVersionId: letter.id, version: letter.version },
      }));
    }
  }

  return suggestions;
}

function generateCommunicationSuggestions(caseRecord: SavedCaseRecord): SuggestionDraft[] {
  const suggestions: SuggestionDraft[] = [];

  for (const thread of caseRecord.communicationThreads ?? []) {
    for (const message of thread.messages ?? []) {
      if (message.status === "sent") {
        suggestions.push(buildSuggestion({
          title: "Antwort prüfen",
          description: message.subject ? `Follow-up zu: ${message.subject}` : "Follow-up zur versendeten Nachricht.",
          type: "follow_up",
          dueAt: daysAfter(message.sentAt ?? message.createdAt, 7),
          priority: "normal",
          source: source("communication", `communication:${message.id}:sent-follow-up`, message.subject || "Versendete Nachricht"),
          reason: "Nachricht wurde versendet; Antwort in 7 Tagen prüfen.",
          metadata: { messageId: message.id, threadId: message.threadId },
        }));
      }
    }
  }

  return suggestions;
}

function generateDocumentSuggestions(caseRecord: SavedCaseRecord): SuggestionDraft[] {
  return (caseRecord.documents ?? []).flatMap((document) => suggestionsFromDocument(document));
}

function suggestionsFromDocument(document: SavedCaseDocument): SuggestionDraft[] {
  const haystack = documentText(document);
  const suggestions: SuggestionDraft[] = [];

  const hearingDate = findDateInText(haystack, ["verhandlung", "tagsatzung", "gericht", "gerichtstermin"]);
  if (hearingDate) suggestions.push(buildSuggestion({
    title: "Verhandlungstermin prüfen",
    type: "hearing",
    startAt: hearingDate,
    endAt: addHours(hearingDate, 1),
    priority: "high",
    source: source("document", `document:${document.id}:hearing`, document.fileName),
    reason: "Im Dokument wurde ein möglicher Verhandlungs-/Tagsatzungstermin erkannt.",
    metadata: { documentId: document.id, documentType: document.type },
  }));

  const visitDate = findDateInText(haystack, ["besichtigung", "nachmessung", "abmessen", "gutachten"]);
  if (visitDate) suggestions.push(buildSuggestion({
    title: "Besichtigung/Nachmessung prüfen",
    type: "visit",
    startAt: visitDate,
    endAt: addHours(visitDate, 1),
    priority: "normal",
    source: source("document", `document:${document.id}:visit`, document.fileName),
    reason: "Im Dokument wurde ein möglicher Besichtigungs- oder Nachmess-Termin erkannt.",
    metadata: { documentId: document.id, documentType: document.type },
  }));

  const deadlineDate = findDateInText(haystack, ["frist", "zahlbar", "zahlung", "antwort", "rückmeldung", "befristungsende", "mietende"]);
  if (deadlineDate) suggestions.push(buildSuggestion({
    title: "Frist aus Dokument prüfen",
    type: "deadline",
    dueAt: deadlineDate,
    priority: "high",
    source: source("document", `document:${document.id}:deadline`, document.fileName),
    reason: "Im Dokument wurde eine mögliche Frist erkannt.",
    metadata: { documentId: document.id, documentType: document.type },
  }));

  return suggestions;
}

function generateCaseSuggestions(caseRecord: SavedCaseRecord): SuggestionDraft[] {
  const suggestions: SuggestionDraft[] = [];
  const leaseEnd = parseAnyDate(caseRecord.extracted?.leaseEnd);

  if (leaseEnd) {
    suggestions.push(buildSuggestion({
      title: "Befristungsende prüfen",
      description: "Befristungsende aus Falldaten.",
      type: "deadline",
      dueAt: leaseEnd,
      priority: "normal",
      source: source("case", "case:lease-end", "Befristungsende"),
      reason: "Im Fall ist ein Mietende/Befristungsende vorhanden.",
    }));
  }

  const hasGutachten = (caseRecord.documents ?? []).some((document) => document.type === "Gutachten");
  if (!hasGutachten && (caseRecord.extracted?.measuredArea || caseRecord.extracted?.nutzflaeche_nachgemessen)) {
    suggestions.push(buildSuggestion({
      title: "Nachmess-/Gutachten-Termin planen",
      type: "visit",
      dueAt: daysAfter(new Date().toISOString(), 7),
      startAt: daysAfter(new Date().toISOString(), 7),
      endAt: addHours(daysAfter(new Date().toISOString(), 7), 1),
      priority: "normal",
      source: source("case", "case:measurement-visit", "Nachmessung/Gutachten"),
      reason: "Nachgemessene Fläche vorhanden, aber kein Gutachten gespeichert.",
    }));
  }

  return suggestions;
}

function documentText(document: SavedCaseDocument) {
  return [
    document.fileName,
    document.extractionSummary,
    Object.entries(document.extractedFields ?? {}).map(([key, value]) => `${key}: ${String(value)}`).join("\n"),
  ].filter(Boolean).join("\n");
}

function findDateInText(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  if (!keywords.some((keyword) => lower.includes(keyword))) return undefined;
  const matches = [
    ...text.matchAll(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:[,\s]+(?:um\s*)?(\d{1,2})[:.](\d{2}))?/gi),
    ...text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})(?:[t\s](\d{2}):(\d{2}))?/gi),
  ];
  for (const match of matches) {
    const date = parseDateMatch(match);
    if (date) return date;
  }
  return undefined;
}

function parseDateMatch(match: RegExpMatchArray) {
  if (match[1]?.length === 4) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 9), Number(match[5] ?? 0));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(year, Number(match[2]) - 1, Number(match[1]), Number(match[4] ?? 9), Number(match[5] ?? 0));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseAnyDate(value?: string) {
  if (!value) return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  return findDateInText(`frist ${value}`, ["frist"]);
}

function buildSuggestion(suggestion: SuggestionDraft): SuggestionDraft {
  return suggestion;
}

function source(type: CalendarSuggestion["source"]["type"], id: string, label: string): CalendarSuggestion["source"] {
  return { type, id, label };
}

function getCalendarSuggestionSourceKey(source: CalendarSuggestion["source"]) {
  return `${source.type}:${source.id ?? source.label ?? "unknown"}`;
}

function uniqueSuggestions(suggestions: CalendarSuggestion[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = getCalendarSuggestionKey(suggestion);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSimilarCalendarTask(task: CaseTask, suggestion: CalendarSuggestion) {
  const taskDate = task.startAt ?? task.dueAt;
  const suggestionDate = suggestion.startAt ?? suggestion.dueAt;
  if (!taskDate || !suggestionDate) return false;
  return task.type === suggestion.type && dayKey(taskDate) === dayKey(suggestionDate) && normalize(task.title) === normalize(suggestion.title);
}

function matchesSource(taskSource: CaseTaskSource | undefined, suggestionSource: CalendarSuggestion["source"]) {
  if (!taskSource || taskSource.type !== suggestionSource.type) return false;
  const reference = suggestionSource.id ?? suggestionSource.label;
  if (!reference) return false;
  return taskSource.id === reference || taskSource.label === reference;
}

function daysAfter(value: string, days: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return addDays(new Date().toISOString(), days);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addHours(value: string, hours: number) {
  const date = new Date(value);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function stableSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 90) || "calendar";
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function dayKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}
