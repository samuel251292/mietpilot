import type { DocumentExtractionResult } from "@/lib/extraction/types";
import type { ExtractedData, PendingExtractedChange, SavedCaseDocument } from "@/types/case";

export type ExtractedReviewValues = Record<string, unknown>;

type ReviewField = {
  field: string;
  label: string;
  sourceFields: Array<keyof ExtractedData>;
  fromExtracted: (data: Partial<ExtractedData>) => unknown;
};

export const reviewFields: ReviewField[] = [
  { field: "tenantName", label: "Mietername", sourceFields: ["tenantName"], fromExtracted: (data) => data.tenantName },
  { field: "tenantFullAddress", label: "Wohnungsadresse", sourceFields: ["tenantFullAddress", "tenantAddress"], fromExtracted: (data) => data.tenantFullAddress || data.tenantAddress },
  { field: "tenantPostalCode", label: "Mieter PLZ", sourceFields: ["tenantPostalCode"], fromExtracted: (data) => data.tenantPostalCode },
  { field: "tenantCity", label: "Mieter Ort", sourceFields: ["tenantCity"], fromExtracted: (data) => data.tenantCity },
  { field: "currentRent", label: "Aktuelle Miete", sourceFields: ["aktuelle_miete", "brutto_miete", "grossRent", "hauptmietzins"], fromExtracted: (data) => data.aktuelle_miete ?? data.brutto_miete ?? data.grossRent ?? data.hauptmietzins },
  { field: "allowedRent", label: "Erlaubte Miete", sourceFields: ["allowedGrossRent"], fromExtracted: (data) => data.allowedGrossRent },
  { field: "contractArea", label: "Nutzfläche laut Vertrag", sourceFields: ["nutzflaeche_laut_vertrag", "contractArea"], fromExtracted: (data) => data.nutzflaeche_laut_vertrag ?? data.contractArea },
  { field: "area", label: "Nutzfläche nachgemessen", sourceFields: ["nutzflaeche_nachgemessen", "measuredArea"], fromExtracted: (data) => data.nutzflaeche_nachgemessen ?? data.measuredArea },
  { field: "landlordName", label: "Vermietername", sourceFields: ["landlord"], fromExtracted: (data) => data.landlord },
  { field: "recipientName", label: "Empfängername", sourceFields: ["recipientName", "landlord", "opposingParty"], fromExtracted: (data) => data.recipientName || data.landlord || data.opposingParty },
  { field: "representation", label: "Vertretung", sourceFields: ["representation", "landlordRepresentedBy"], fromExtracted: (data) => data.representation || data.landlordRepresentedBy },
  { field: "leaseStart", label: "Mietbeginn", sourceFields: ["leaseStart", "moveInDate"], fromExtracted: (data) => data.leaseStart || data.moveInDate },
  { field: "category", label: "Kategorie", sourceFields: ["category"], fromExtracted: (data) => data.category },
  { field: "fixedTerm", label: "Befristung", sourceFields: ["fixedTerm"], fromExtracted: (data) => data.fixedTerm },
];

export function createPendingExtractedChanges(
  currentValues: ExtractedReviewValues,
  extracted: Partial<ExtractedData>,
  documentResults: DocumentExtractionResult[] = [],
  savedDocuments: SavedCaseDocument[] = [],
): PendingExtractedChange[] {
  return reviewFields.flatMap((field) => {
    const newValue = field.fromExtracted(extracted);
    if (isBlankValue(newValue)) return [];

    const currentValue = currentValues[field.field];
    if (valuesEqual(currentValue, newValue)) return [];

    const source = findSourceDocument(field, documentResults, savedDocuments);

    return [
      {
        field: field.field,
        label: field.label,
        currentValue: normalizeComparableValue(currentValue),
        newValue: normalizeComparableValue(newValue),
        sourceDocumentId: source?.id,
        sourceDocumentType: source?.type,
        sourceDocumentName: source?.fileName,
        changed: true,
      },
    ];
  });
}

export function createReviewValuesFromExtracted(extracted: ExtractedData, calculation?: { currentGrossRent?: number; allowedGrossRent?: number }): ExtractedReviewValues {
  return {
    tenantName: extracted.tenantName,
    tenantFullAddress: extracted.tenantFullAddress || extracted.tenantAddress,
    tenantPostalCode: extracted.tenantPostalCode,
    tenantCity: extracted.tenantCity,
    currentRent: extracted.aktuelle_miete || extracted.brutto_miete || extracted.grossRent || calculation?.currentGrossRent,
    allowedRent: extracted.allowedGrossRent || calculation?.allowedGrossRent,
    contractArea: extracted.nutzflaeche_laut_vertrag || extracted.contractArea,
    area: extracted.nutzflaeche_nachgemessen || extracted.measuredArea,
    landlordName: extracted.landlord,
    recipientName: extracted.recipientName || extracted.landlord || extracted.opposingParty,
    representation: extracted.representation || extracted.landlordRepresentedBy,
    leaseStart: extracted.leaseStart || extracted.moveInDate,
    category: extracted.category,
    fixedTerm: extracted.fixedTerm,
  };
}

export function mergePendingExtractedChanges(current: PendingExtractedChange[] = [], next: PendingExtractedChange[] = []) {
  if (next.length === 0) return current;

  const nextFields = new Set(next.map((change) => change.field));
  return [...current.filter((change) => !nextFields.has(change.field)), ...next];
}

function findSourceDocument(field: ReviewField, documentResults: DocumentExtractionResult[], savedDocuments: SavedCaseDocument[]) {
  const result = documentResults.find((document) => field.sourceFields.some((sourceField) => hasValue(document.data[sourceField])));
  if (!result) return undefined;

  const saved = savedDocuments.find((document) => document.type === result.type && document.fileName === result.fileName);
  return {
    id: saved?.id,
    type: result.type,
    fileName: result.fileName,
  };
}

function valuesEqual(left: unknown, right: unknown) {
  const normalizedLeft = normalizeComparableValue(left);
  const normalizedRight = normalizeComparableValue(right);

  if (typeof normalizedLeft === "number" && typeof normalizedRight === "number") {
    return Math.abs(normalizedLeft - normalizedRight) < 0.01;
  }

  return String(normalizedLeft).trim().toLowerCase() === String(normalizedRight).trim().toLowerCase();
}

function normalizeComparableValue(value: unknown) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "boolean") return value;
  return value ?? "";
}

function isBlankValue(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return !Number.isFinite(value) || value === 0;
  return false;
}

function hasValue(value: unknown) {
  return !isBlankValue(value);
}
