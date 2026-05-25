import { CaseService, formatStoredDate } from "@/lib/case-service";
import { isDocumentReExtractable } from "@/lib/documents/data-url";
import { createPendingExtractedChanges, createReviewValuesFromExtracted, mergePendingExtractedChanges } from "@/lib/extraction/pending-changes";
import { fetchFileAsFile } from "@/lib/storage/file-resolver";
import type { DocumentExtractionResult, ExtractApiResponse } from "@/lib/extraction/types";
import type { PublicUser } from "@/lib/auth";
import type { SavedCaseDocument, SavedCaseRecord } from "@/types/case";

export type ReExtractDocumentResult = {
  record?: SavedCaseRecord;
  analyzed: number;
  skippedLegacy: number;
  message: string;
};

export async function reExtractSavedDocument(record: SavedCaseRecord, documentId: string, actor?: PublicUser | null): Promise<ReExtractDocumentResult> {
  const current = CaseService.get(record.id) ?? record;
  const document = current.documents.find((item) => item.id === documentId);

  if (!document || !isDocumentReExtractable(document)) {
    return {
      record: current,
      analyzed: 0,
      skippedLegacy: 1,
      message: "Dateiinhalt nicht gespeichert - erneute Analyse nicht möglich.",
    };
  }

  CaseService.addActivity(
    current.id,
    CaseService.buildActivity("extraction_started", "Datenextraktion gestartet", {
      actor,
      description: document.fileName,
      metadata: { fileName: document.fileName, documentId: document.id },
    }),
  );

  try {
    const file = await fetchFileAsFile(document, document.fileName, document.mimeType);
    if (!file) throw new Error("Datei konnte nicht geladen werden. Bitte laden Sie das Dokument erneut hoch.");

    const formData = new FormData();
    formData.append(document.type, file, document.fileName);

    const response = await fetch("/api/extract", {
      method: "POST",
      body: formData,
    });
    const result = await readExtractionResponse(response);
    const extraction = normalizeExtractionDocuments(result).find((item) => item.type === document.type && item.fileName === document.fileName) ?? normalizeExtractionDocuments(result)[0];

    if (!response.ok || !result.success || !extraction) {
      throw new Error(result.error || extraction?.error || "Die Datenextraktion ist fehlgeschlagen.");
    }

    const nextRecord = saveDocumentExtraction(current, document.id, extraction, result, actor);
    return {
      record: nextRecord,
      analyzed: 1,
      skippedLegacy: 0,
      message: "Dokument wurde neu analysiert. Bitte prüfen Sie, ob erkannte Werte übernommen werden sollen.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Datenextraktion ist fehlgeschlagen.";
    const now = new Date().toISOString();
    const nextRecord = CaseService.save(
      {
        ...current,
        updatedAt: now,
        lastActivity: formatStoredDate(now),
        updatedBy: actor?.id ?? current.updatedBy,
        documents: current.documents.map((item) =>
          item.id === document.id
            ? {
                ...item,
                extractionStatus: "failed",
                extractionError: message,
                extractionWarnings: item.extractionWarnings ?? [],
                extractedAt: now,
              }
            : item,
        ),
      },
      {
        actor,
        skipAutoActivity: true,
        activity: CaseService.buildActivity("extraction_completed", "Datenextraktion fehlgeschlagen", {
          actor,
          description: document.fileName,
          metadata: { fileName: document.fileName, documentId: document.id, error: message },
        }),
      },
    );

    return { record: nextRecord, analyzed: 0, skippedLegacy: 0, message };
  }
}

export function countSkippedLegacyDocuments(documents: SavedCaseDocument[]) {
  return documents.filter((document) => !isDocumentReExtractable(document)).length;
}

export function applyExtractionToDocument(document: SavedCaseDocument, extraction: DocumentExtractionResult, extractedAt: string): SavedCaseDocument {
  return {
    ...document,
    extractionStatus: extraction.success ? "success" : "failed",
    extractionSummary: extraction.message,
    extractedTextLength: extraction.extractedTextLength,
    extractedFields: extraction.data,
    extractionWarnings: createExtractionWarnings(extraction),
    extractionError: extraction.error,
    extractedAt,
  };
}

export function createExtractionWarnings(result: DocumentExtractionResult) {
  return [
    ...(result.warnings ?? []),
    ...result.issues.map((issue) => `${issue.field}: ${issue.message}`),
    ...(result.requiresOCR ? ["OCR erforderlich"] : []),
    ...(result.message ? [result.message] : []),
  ].filter((warning, index, warnings) => warning && warnings.indexOf(warning) === index);
}

async function readExtractionResponse(response: Response): Promise<ExtractApiResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return (await response.json()) as ExtractApiResponse;

  return {
    success: false,
    error: "Die Extraktions-API hat keine gültige JSON-Antwort geliefert.",
    documents: {},
    documentResults: [],
    data: {},
    mergedData: {},
    issues: [],
    warnings: ["Die Extraktions-API hat keine gültige JSON-Antwort geliefert."],
  };
}

function normalizeExtractionDocuments(result: ExtractApiResponse): DocumentExtractionResult[] {
  if (result.documentResults) return result.documentResults;
  return Object.values(result.documents).filter((document): document is DocumentExtractionResult => Boolean(document));
}

function saveDocumentExtraction(record: SavedCaseRecord, documentId: string, extraction: DocumentExtractionResult, result: ExtractApiResponse, actor?: PublicUser | null) {
  const now = new Date().toISOString();
  const document = record.documents.find((item) => item.id === documentId);
  const documentResults = normalizeExtractionDocuments(result);
  const pendingExtractedChanges = mergePendingExtractedChanges(
    record.pendingExtractedChanges,
    createPendingExtractedChanges(createReviewValuesFromExtracted(record.extracted, record.calculation), result.mergedData ?? result.data ?? extraction.data, documentResults, record.documents),
  );

  return CaseService.save(
    {
      ...record,
      updatedAt: now,
      lastActivity: formatStoredDate(now),
      updatedBy: actor?.id ?? record.updatedBy,
      documents: record.documents.map((item) => (item.id === documentId ? applyExtractionToDocument(item, extraction, now) : item)),
      pendingExtractedChanges,
    },
    {
      actor,
      skipAutoActivity: true,
      activity: CaseService.buildActivity("extraction_completed", "Datenextraktion abgeschlossen", {
        actor,
        description: document?.fileName,
        metadata: { fileName: document?.fileName, documentId, success: extraction.success },
      }),
    },
  );
}
