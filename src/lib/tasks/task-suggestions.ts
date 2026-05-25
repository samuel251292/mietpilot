import { getDocumentQuality, type RequiredDocumentType } from "@/lib/documents/document-quality";
import { createTask } from "@/lib/tasks/task-service";
import type { CaseTaskSource, CommunicationMessage, GeneratedLetterVersion, SavedCaseRecord, TaskSuggestion } from "@/types/case";

type SuggestionDraft = Omit<TaskSuggestion, "id" | "suggestedAt">;

export function generateTaskSuggestions(caseRecord: SavedCaseRecord) {
  const suggestedAt = new Date().toISOString();
  const suggestions = [
    ...generateDocumentSuggestions(caseRecord),
    ...generateLetterSuggestions(caseRecord),
    ...generateCommunicationSuggestions(caseRecord),
    ...generateCalculationSuggestions(caseRecord),
  ].map((suggestion) => {
    const withId: TaskSuggestion = {
      ...suggestion,
      id: `suggestion_${stableSlug(getSuggestionSourceKey(suggestion.source))}`,
      suggestedAt,
    };
    return withId;
  });

  return uniqueSuggestions(suggestions).filter((suggestion) => !isSuggestionAlreadyApplied(caseRecord, suggestion));
}

export function applyTaskSuggestion(caseRecord: SavedCaseRecord, suggestion: TaskSuggestion) {
  const nextRecord = createTask(caseRecord, {
    title: suggestion.title,
    description: suggestion.description,
    type: suggestion.type,
    priority: suggestion.priority,
    dueAt: suggestion.dueAt,
    remindAt: suggestion.remindAt,
    source: suggestion.source,
    metadata: {
      ...(suggestion.metadata ?? {}),
      suggestionId: suggestion.id,
      suggestionReason: suggestion.reason,
      suggestionKey: getSuggestionKey(suggestion),
    },
  });

  const [createdActivity, ...rest] = nextRecord.activityLog ?? [];
  if (!createdActivity) return nextRecord;
  return {
    ...nextRecord,
    activityLog: [
      {
        ...createdActivity,
        title: "Aufgabe aus Vorschlag erstellt",
        description: suggestion.reason,
        metadata: {
          ...(createdActivity.metadata ?? {}),
          suggestionId: suggestion.id,
          suggestionKey: getSuggestionKey(suggestion),
          suggestionReason: suggestion.reason,
        },
      },
      ...rest,
    ],
  };
}

export function applyAllTaskSuggestions(caseRecord: SavedCaseRecord) {
  return generateTaskSuggestions(caseRecord).reduce((record, suggestion) => applyTaskSuggestion(record, suggestion), caseRecord);
}

export function getSuggestionKey(suggestion: TaskSuggestion) {
  return getSuggestionSourceKey(suggestion.source);
}

export function isSuggestionAlreadyApplied(caseRecord: SavedCaseRecord, suggestion: TaskSuggestion) {
  const key = getSuggestionKey(suggestion);
  return (caseRecord.caseTasks ?? []).some((task) => {
    if (task.status === "done" || task.status === "archived" || task.status === "dismissed") return false;
    const taskKey = String(task.metadata?.suggestionKey ?? "");
    return taskKey === key || matchesSuggestionSource(task.source, suggestion.source) || normalize(task.title) === normalize(suggestion.title);
  });
}

function generateDocumentSuggestions(caseRecord: SavedCaseRecord): SuggestionDraft[] {
  const quality = getDocumentQuality(caseRecord);
  const suggestions: SuggestionDraft[] = [];

  const missingTasks: Record<RequiredDocumentType, string> = {
    Datenblatt: "Datenblatt nachfordern",
    Mietvertrag: "Mietvertrag nachfordern",
    Richtwert: "Richtwertberechnung nachfordern",
  };

  for (const [type, status] of Object.entries(quality.requiredDocuments) as Array<[RequiredDocumentType, string]>) {
    if (status === "fehlt") {
      suggestions.push(buildSuggestion({
        title: missingTasks[type],
        type: "deadline",
        priority: "high",
        source: source("document", `document:${type}:missing`, type),
        reason: `${type} fehlt im Fall.`,
        dueAt: daysFromNow(3),
      }));
    }
    if (status === "OCR erforderlich") {
      suggestions.push(buildSuggestion({
        title: "OCR-Ergebnis prüfen",
        description: `${type} benötigt eine OCR- oder manuelle Prüfung.`,
        type: "task",
        priority: "high",
        source: source("document", `document:${type}:ocr`, type),
        reason: `${type} ist als OCR erforderlich markiert.`,
      }));
    }
    if (status === "Extraktion fehlgeschlagen") {
      suggestions.push(buildSuggestion({
        title: "Dokument manuell prüfen",
        description: `${type} konnte nicht automatisch extrahiert werden.`,
        type: "task",
        priority: "high",
        source: source("document", `document:${type}:failed`, type),
        reason: `${type}: Extraktion fehlgeschlagen.`,
      }));
    }
    if (status === "ungeprüfte Änderungen vorhanden") {
      suggestions.push(buildSuggestion({
        title: "Neu erkannte Werte prüfen",
        description: `${type} enthält erkannte Änderungen, die noch nicht übernommen oder verworfen wurden.`,
        type: "task",
        priority: "normal",
        source: source("document", `document:${type}:pending-changes`, type),
        reason: `${type}: ungeprüfte Änderungen vorhanden.`,
      }));
    }
  }

  if (caseRecord.pendingExtractedChanges?.some((change) => change.changed)) {
    suggestions.push(buildSuggestion({
      title: "Extraktionsänderungen prüfen",
      description: "Es gibt neu erkannte Werte, die noch nicht geprüft wurden.",
      type: "task",
      priority: "normal",
      source: source("calculation", "extraction:pending-changes", "Ungeprüfte Extraktionsänderungen"),
      reason: "Ungeprüfte pendingExtractedChanges vorhanden.",
    }));
  }

  return suggestions;
}

function generateLetterSuggestions(caseRecord: SavedCaseRecord): SuggestionDraft[] {
  const suggestions: SuggestionDraft[] = [];
  const review = caseRecord.letterReview;

  if (review?.status === "review_required" || (review?.missingFields?.length ?? 0) > 0 || (review?.unresolvedPlaceholders?.length ?? 0) > 0) {
    suggestions.push(buildSuggestion({
      title: "Vergleichsschreiben prüfen",
      description: "Das Schreiben enthält offene Review-Punkte oder nicht ersetzte Platzhalter.",
      type: "task",
      priority: "high",
      source: source("letter", "letter:review-required", "Schreiben Review"),
      reason: "Schreiben Review erforderlich.",
    }));
  }

  for (const letter of caseRecord.generatedLetters ?? []) {
    if (letter.status !== "archived" && letter.status !== "sent" && !letter.approval?.approvedAt && !letter.outdated) {
      suggestions.push(buildLetterSuggestion(letter, "Schreiben freigeben", "Schreiben ist noch nicht freigegeben.", "letter:approve", "normal"));
    }
    if (letter.outdated || letter.status === "outdated") {
      suggestions.push(buildLetterSuggestion(letter, "Schreiben neu generieren", "Schreiben basiert auf älteren Falldaten.", "letter:outdated", "high"));
    }
    if (letter.status === "sent" || letter.sent?.sentAt) {
      suggestions.push(buildSuggestion({
        title: "Rückmeldung prüfen",
        description: `Follow-up zu Schreiben Version ${letter.version}.`,
        type: "follow_up",
        priority: "normal",
        dueAt: daysFromNow(7),
        remindAt: daysFromNow(7),
        source: source("letter", `letter:${letter.id}:sent-follow-up`, `Schreiben Version ${letter.version}`),
        reason: "Schreiben wurde versendet; Rückmeldung in 7 Tagen prüfen.",
        metadata: { letterVersionId: letter.id, version: letter.version },
      }));
    }
  }

  return suggestions;
}

function buildLetterSuggestion(letter: GeneratedLetterVersion, title: string, reason: string, key: string, priority: TaskSuggestion["priority"]): SuggestionDraft {
  return buildSuggestion({
    title,
    description: `Schreiben Version ${letter.version}: ${reason}`,
    type: "task",
    priority,
    source: source("letter", `${key}:${letter.id}`, `Schreiben Version ${letter.version}`),
    reason,
    metadata: { letterVersionId: letter.id, version: letter.version },
  });
}

function generateCommunicationSuggestions(caseRecord: SavedCaseRecord): SuggestionDraft[] {
  const suggestions: SuggestionDraft[] = [];

  for (const thread of caseRecord.communicationThreads ?? []) {
    for (const message of thread.messages ?? []) {
      if (message.status === "ready") {
        suggestions.push(buildMessageSuggestion(message, "E-Mail versenden", "E-Mail-Entwurf ist bereit zum Versand.", "communication:ready", "high"));
      }
      if (message.status === "failed") {
        suggestions.push(buildMessageSuggestion(message, "Versandfehler prüfen", message.error || "Nachrichtenversand ist fehlgeschlagen.", "communication:failed", "high"));
      }
      if (message.status === "sent") {
        suggestions.push(buildSuggestion({
          title: "Antwort prüfen",
          description: message.subject ? `Follow-up zu: ${message.subject}` : "Follow-up zur versendeten Nachricht.",
          type: "follow_up",
          priority: "normal",
          dueAt: daysFromNow(7),
          remindAt: daysFromNow(7),
          source: source("communication", `communication:${message.id}:sent-follow-up`, message.subject || "Versendete Nachricht"),
          reason: "Nachricht wurde versendet; Antwort in 7 Tagen prüfen.",
          metadata: { messageId: message.id, threadId: message.threadId },
        }));
      }
    }
  }

  return suggestions;
}

function buildMessageSuggestion(message: CommunicationMessage, title: string, reason: string, key: string, priority: TaskSuggestion["priority"]): SuggestionDraft {
  return buildSuggestion({
    title,
    description: message.subject,
    type: "task",
    priority,
    source: source("communication", `${key}:${message.id}`, message.subject || title),
    reason,
    metadata: { messageId: message.id, threadId: message.threadId },
  });
}

function generateCalculationSuggestions(caseRecord: SavedCaseRecord): SuggestionDraft[] {
  const calculation = caseRecord.calculation;
  const suggestions: SuggestionDraft[] = [];

  if ((calculation?.calculationWarnings ?? []).length > 0) {
    suggestions.push(buildSuggestion({
      title: "Berechnung prüfen",
      description: calculation.calculationWarnings?.join("; "),
      type: "task",
      priority: "high",
      source: source("calculation", "calculation:warnings", "Berechnungswarnungen"),
      reason: "Berechnungswarnungen vorhanden.",
    }));
  }
  if (!Number(calculation?.currentGrossRent)) {
    suggestions.push(buildSuggestion({
      title: "Aktuelle Miete prüfen",
      type: "task",
      priority: "high",
      source: source("calculation", "calculation:missing-current-rent", "Aktuelle Miete"),
      reason: "Aktuelle Miete fehlt oder ist 0.",
    }));
  }
  if (!Number(calculation?.allowedGrossRent)) {
    suggestions.push(buildSuggestion({
      title: "Erlaubte Miete prüfen",
      type: "task",
      priority: "high",
      source: source("calculation", "calculation:missing-allowed-rent", "Erlaubte Miete"),
      reason: "Erlaubte Miete fehlt oder ist 0.",
    }));
  }

  return suggestions;
}

function buildSuggestion(suggestion: SuggestionDraft): SuggestionDraft {
  return suggestion;
}

function source(type: CaseTaskSource["type"], id: string, label: string): CaseTaskSource {
  return { type, id, label };
}

function getSuggestionSourceKey(source?: CaseTaskSource) {
  if (!source) return "case:unknown";
  return `${source.type}:${source.id ?? source.label ?? "unknown"}`;
}

function uniqueSuggestions(suggestions: TaskSuggestion[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = getSuggestionKey(suggestion);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function stableSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 90) || "task";
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchesSuggestionSource(taskSource: CaseTaskSource | undefined, suggestionSource: CaseTaskSource | undefined) {
  if (!taskSource || !suggestionSource || taskSource.type !== suggestionSource.type) return false;
  const suggestionReference = suggestionSource.id ?? suggestionSource.label;
  if (!suggestionReference) return false;
  return taskSource.id === suggestionReference || taskSource.label === suggestionReference;
}
