import type { GeneratedLetterStatus, GeneratedLetterVersion, LetterAttachment, LetterReview, SavedCaseRecord, SavedGeneratedFile } from "@/types/case";
import type { StoredWordTemplate } from "@/lib/word-templates";

type LetterVersionInput = {
  record: SavedCaseRecord;
  createdAt: string;
  createdBy?: string;
  template?: Pick<StoredWordTemplate, "id" | "fileName">;
  letterText?: string;
  docx?: SavedGeneratedFile;
  pdf?: SavedGeneratedFile;
  attachments?: LetterAttachment[];
  review?: LetterReview;
  placeholdersUsed?: string[];
  warnings?: string[];
  calculationReportAttached?: boolean;
  metadata?: Record<string, unknown>;
};

export function getNextLetterVersion(letters: GeneratedLetterVersion[] = []) {
  return Math.max(0, ...letters.map((letter) => letter.version || 0)) + 1;
}

export function createGeneratedLetterVersion({
  record,
  createdAt,
  createdBy,
  template,
  letterText,
  docx,
  pdf,
  attachments = [],
  review,
  placeholdersUsed = [],
  warnings = [],
  calculationReportAttached = false,
  metadata,
}: LetterVersionInput): GeneratedLetterVersion {
  const version = getNextLetterVersion(record.generatedLetters);

  return {
    id: `letter-${Date.now()}-${version}`,
    version,
    createdAt,
    createdBy,
    status: getNextLetterStatus(review, Boolean(docx || pdf)),
    templateId: template?.id,
    templateName: template?.fileName,
    templateFileName: template?.fileName,
    title: `Vergleichsschreiben Version ${version}`,
    letterText,
    docx,
    pdf,
    attachments,
    review,
    calculationReportAttached,
    reportVersion: record.calculationReportVersion,
    basedOnCalculationGeneratedAt: record.calculationReportGeneratedAt ?? record.updatedAt,
    outdated: false,
    placeholdersUsed,
    warnings,
    metadata,
    statusHistory: [
      buildLetterStatusHistoryEntry(getNextLetterStatus(review, Boolean(docx || pdf)), {
        changedAt: createdAt,
        changedByName: createdBy,
        note: "Schreiben-Version erstellt",
      }),
    ],
  };
}

export function getNextLetterStatus(review?: LetterReview, generated = true): GeneratedLetterStatus {
  if (!generated) return "draft";
  if ((review?.unresolvedPlaceholders?.length ?? 0) > 0 || (review?.missingFields?.length ?? 0) > 0) return "review";
  return "ready";
}

export function updateLetterVersionStatus(
  letter: GeneratedLetterVersion,
  status: GeneratedLetterStatus,
  options: { changedAt?: string; changedBy?: string; changedByName?: string; note?: string } = {},
): GeneratedLetterVersion {
  const changedAt = options.changedAt ?? new Date().toISOString();
  return {
    ...letter,
    status,
    outdated: status === "outdated" ? true : letter.outdated,
    statusHistory: [
      buildLetterStatusHistoryEntry(status, { ...options, changedAt }),
      ...(letter.statusHistory ?? []),
    ],
  };
}

export function approveLetterVersion(
  letter: GeneratedLetterVersion,
  options: { approvedAt?: string; approvedBy?: string; approvedByName?: string; approvalNote?: string } = {},
): GeneratedLetterVersion {
  if ((letter.review?.unresolvedPlaceholders?.length ?? 0) > 0) {
    throw new Error("Freigabe nicht möglich: Das Schreiben enthält nicht ersetzte Platzhalter.");
  }

  const approvedAt = options.approvedAt ?? new Date().toISOString();
  return {
    ...updateLetterVersionStatus(letter, "ready", {
      changedAt: approvedAt,
      changedBy: options.approvedBy,
      changedByName: options.approvedByName,
      note: options.approvalNote || "Schreiben freigegeben",
    }),
    approval: {
      approvedAt,
      approvedBy: options.approvedBy,
      approvedByName: options.approvedByName,
      approvalNote: options.approvalNote,
    },
  };
}

export function markLetterVersionSent(
  letter: GeneratedLetterVersion,
  options: { sentAt?: string; sentBy?: string; sentByName?: string; method?: "email" | "post" | "manual" | "other"; note?: string; force?: boolean } = {},
): GeneratedLetterVersion {
  if (!letter.approval?.approvedAt && !options.force) {
    throw new Error("Versandmarkierung erfordert vorherige Freigabe oder ausdrückliche Bestätigung.");
  }

  const sentAt = options.sentAt ?? new Date().toISOString();
  return {
    ...updateLetterVersionStatus(letter, "sent", {
      changedAt: sentAt,
      changedBy: options.sentBy,
      changedByName: options.sentByName,
      note: options.note || "Schreiben als versendet markiert",
    }),
    sent: {
      sentAt,
      sentBy: options.sentBy,
      sentByName: options.sentByName,
      method: options.method,
      note: options.note,
    },
  };
}

export function archiveLetterVersion(
  letter: GeneratedLetterVersion,
  options: { changedAt?: string; changedBy?: string; changedByName?: string; note?: string } = {},
) {
  return updateLetterVersionStatus(letter, "archived", { ...options, note: options.note || "Schreiben archiviert" });
}

export function buildLetterStatusHistoryEntry(
  status: GeneratedLetterVersion["status"],
  options: { changedAt?: string; changedBy?: string; changedByName?: string; note?: string } = {},
) {
  return {
    id: `letter-status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status,
    changedAt: options.changedAt ?? new Date().toISOString(),
    changedBy: options.changedBy,
    changedByName: options.changedByName,
    note: options.note,
  };
}

export function appendGeneratedLetterVersion(record: SavedCaseRecord, letter: GeneratedLetterVersion): SavedCaseRecord {
  const previous = markLettersOutdated(record.generatedLetters ?? [], "Neue Schreiben-Version erstellt");
  return { ...record, generatedLetters: [letter, ...previous] };
}

export function markOutdatedGeneratedLetters(record: SavedCaseRecord, reason: string): SavedCaseRecord {
  if (!record.generatedLetters?.length) return record;
  return { ...record, generatedLetters: markLettersOutdated(record.generatedLetters, reason) };
}

export function hasLetterOutdatedReason({
  calculationChanged,
  documentsChanged,
  dataChanged,
  hasPendingChanges,
}: {
  calculationChanged?: boolean;
  documentsChanged?: boolean;
  dataChanged?: boolean;
  hasPendingChanges?: boolean;
}) {
  return Boolean(calculationChanged || documentsChanged || dataChanged || hasPendingChanges);
}

function markLettersOutdated(letters: GeneratedLetterVersion[], reason: string) {
  return letters.map((letter) => {
    if (letter.status === "archived" || letter.outdated) return letter;
    return {
      ...letter,
      status: "outdated" as const,
      outdated: true,
      statusHistory: [
        buildLetterStatusHistoryEntry("outdated", { note: reason }),
        ...(letter.statusHistory ?? []),
      ],
      warnings: Array.from(new Set([...(letter.warnings ?? []), "Dieses Schreiben basiert auf älteren Berechnungs-/Falldaten."])),
      metadata: { ...(letter.metadata ?? {}), outdatedReason: reason },
    };
  });
}
