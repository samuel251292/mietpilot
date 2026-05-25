import type { SavedCaseDocument, SavedCaseRecord } from "@/types/case";

export const requiredDocumentTypes = ["Datenblatt", "Mietvertrag", "Richtwert"] as const;

export type RequiredDocumentType = (typeof requiredDocumentTypes)[number];

export type RequiredDocumentStatus =
  | "vorhanden"
  | "fehlt"
  | "legacy ohne Dateiinhalt"
  | "OCR erforderlich"
  | "Extraktion fehlgeschlagen"
  | "erfolgreich analysiert"
  | "ungeprüfte Änderungen vorhanden";

export type DocumentQuality = {
  requiredDocuments: Record<RequiredDocumentType, RequiredDocumentStatus>;
  complete: boolean;
  readyForCalculation: boolean;
  needsReview: boolean;
  exportOutdated: boolean;
  canGenerateLetter: boolean;
  warnings: string[];
};

export function getDocumentQuality(record: SavedCaseRecord): DocumentQuality {
  const requiredDocuments = getRequiredDocumentStatus(record);
  const warnings = getDocumentWarnings(record);
  const complete = requiredDocumentTypes.every((type) => findDocument(record, type));
  const readyForCalculation = isSuccessfullyAnalyzed(findDocument(record, "Datenblatt")) && isSuccessfullyAnalyzed(findDocument(record, "Richtwert"));
  const needsReview = warnings.length > 0 || Boolean(record.pendingExtractedChanges?.length);
  const exportOutdated = isExportOutdated(record);
  const hasCriticalErrors = requiredDocumentTypes.some((type) => {
    const status = requiredDocuments[type];
    return status === "fehlt" || status === "OCR erforderlich" || status === "Extraktion fehlgeschlagen";
  });

  return {
    requiredDocuments,
    complete,
    readyForCalculation,
    needsReview,
    exportOutdated,
    canGenerateLetter: complete && !hasCriticalErrors,
    warnings: [...warnings, ...(exportOutdated ? ["Export veraltet"] : [])],
  };
}

export function getRequiredDocumentStatus(record: SavedCaseRecord): Record<RequiredDocumentType, RequiredDocumentStatus> {
  return Object.fromEntries(requiredDocumentTypes.map((type) => [type, getSingleRequiredDocumentStatus(record, type)])) as Record<RequiredDocumentType, RequiredDocumentStatus>;
}

export function getDocumentWarnings(record: SavedCaseRecord) {
  const warnings: string[] = [];

  for (const type of requiredDocumentTypes) {
    const status = getSingleRequiredDocumentStatus(record, type);
    if (status === "fehlt") warnings.push(`${type} fehlt`);
    if (status === "legacy ohne Dateiinhalt") warnings.push(`${type}: Legacy ohne Dateiinhalt`);
    if (status === "OCR erforderlich") warnings.push(`${type}: OCR nötig`);
    if (status === "Extraktion fehlgeschlagen") warnings.push(`${type}: Extraktion fehlgeschlagen`);
    if (status === "ungeprüfte Änderungen vorhanden") warnings.push(`${type}: ungeprüfte Änderungen`);
  }

  if (record.pendingExtractedChanges?.length) warnings.push("Ungeprüfte Änderungen");

  return unique(warnings);
}

export function getSingleRequiredDocumentStatus(record: SavedCaseRecord, type: RequiredDocumentType): RequiredDocumentStatus {
  const document = findDocument(record, type);
  if (!document) return "fehlt";
  if (hasPendingChangesForDocument(record, document)) return "ungeprüfte Änderungen vorhanden";
  if (!document.dataUrl) return "legacy ohne Dateiinhalt";
  if (document.extractionStatus === "failed") {
    return document.extractionWarnings?.some((warning) => /ocr/i.test(warning)) ? "OCR erforderlich" : "Extraktion fehlgeschlagen";
  }
  if (document.extractionWarnings?.some((warning) => /ocr\s+erforderlich/i.test(warning))) return "OCR erforderlich";
  if (document.extractionStatus === "success") return "erfolgreich analysiert";
  return "vorhanden";
}

export function getDocumentQualityLabel(document: SavedCaseDocument) {
  if (!document.dataUrl) return "Legacy";
  if (document.extractionStatus === "success") {
    if (document.extractionWarnings?.some((warning) => /ocr\s+wurde\s+verwendet/i.test(warning))) return "OCR verwendet";
    return "Erfolgreich analysiert";
  }
  if (document.extractionStatus === "failed") {
    if (document.extractionWarnings?.some((warning) => /ocr/i.test(warning))) return "OCR nötig";
    return "Fehlgeschlagen";
  }
  if (document.extractionStatus === "pending") return "Ausstehend";
  if (document.extractionStatus === "not_applicable") return "Nicht anwendbar";
  return "Gespeichert";
}

function findDocument(record: SavedCaseRecord, type: RequiredDocumentType) {
  return record.documents.find((document) => document.type === type);
}

function isSuccessfullyAnalyzed(document?: SavedCaseDocument) {
  return Boolean(document?.dataUrl && document.extractionStatus === "success");
}

function hasPendingChangesForDocument(record: SavedCaseRecord, document: SavedCaseDocument) {
  return Boolean(
    record.pendingExtractedChanges?.some(
      (change) => change.sourceDocumentId === document.id || (!change.sourceDocumentId && change.sourceDocumentType === document.type),
    ),
  );
}

function isExportOutdated(record: SavedCaseRecord) {
  const generatedAt = record.generatedPdf?.generatedAt ?? record.generatedWord?.generatedAt;
  if (!generatedAt) return false;
  return new Date(generatedAt).getTime() < new Date(record.updatedAt).getTime();
}

function unique(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}
