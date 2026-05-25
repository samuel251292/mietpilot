import { normalizeStoredFileMeta } from "@/lib/storage/file-resolver";
import { storageBuckets } from "@/lib/storage/storage-buckets";
import { mapStorageUploadToMeta, uploadFileToStorage } from "@/lib/storage/supabase-storage";
import type { CommunicationAttachment, SavedCaseDocument, SavedCaseRecord, SavedGeneratedFile } from "@/types/case";
import type { StoredFileMeta } from "@/types/storage";

export type CommunicationAttachmentSource =
  | { type: "letter"; letterVersionId: string; format: "docx" | "pdf" }
  | { type: "calculation-report"; format: "docx" | "pdf" }
  | { type: "document"; documentId: string };

export function shouldUseSupabaseCommunicationAttachmentStorage() {
  return (process.env.NEXT_PUBLIC_FILE_STORAGE ?? "local").toLowerCase() === "supabase";
}

export function resolveCommunicationAttachmentFile(caseRecord: SavedCaseRecord | undefined, attachment: CommunicationAttachment) {
  if (hasAttachmentOwnContent(attachment)) return attachmentToFileReference(attachment);

  if (attachment.sourceLetterVersionId) {
    const letter = caseRecord?.generatedLetters?.find((item) => item.id === attachment.sourceLetterVersionId);
    const format = attachment.type === "letter_docx" ? "docx" : "pdf";
    const file = format === "docx" ? letter?.docx : letter?.pdf;
    if (file) return generatedFileToReference(file);
  }

  if (attachment.sourceCalculationReport) {
    const format = attachment.metadata?.format === "docx" ? "docx" : "pdf";
    const file = format === "docx" ? caseRecord?.calculationReportDocx : caseRecord?.calculationReportPdf;
    if (file) return generatedFileToReference(file);
  }

  if (attachment.sourceDocumentId) {
    const document = caseRecord?.documents?.find((item) => item.id === attachment.sourceDocumentId);
    if (document) return documentToReference(document);
  }

  return null;
}

export function buildCommunicationAttachmentReference(caseRecord: SavedCaseRecord, source: CommunicationAttachmentSource): CommunicationAttachment | null {
  if (source.type === "letter") {
    const letter = caseRecord.generatedLetters?.find((item) => item.id === source.letterVersionId);
    const file = source.format === "docx" ? letter?.docx : letter?.pdf;
    if (!letter || !file) return null;
    return normalizeCommunicationAttachment({
      id: createAttachmentId(),
      type: source.format === "docx" ? "letter_docx" : "letter_pdf",
      label: `Vergleichsschreiben Version ${letter.version} ${source.format.toUpperCase()}`,
      fileName: file.fileName,
      mimeType: file.mimeType,
      storage: file.storage,
      storageStatus: file.storageStatus,
      sourceLetterVersionId: letter.id,
      source: "reference",
      metadata: { generatedAt: file.generatedAt, format: source.format },
    });
  }

  if (source.type === "calculation-report") {
    const file = source.format === "docx" ? caseRecord.calculationReportDocx : caseRecord.calculationReportPdf;
    if (!file) return null;
    return normalizeCommunicationAttachment({
      id: createAttachmentId(),
      type: "calculation_report",
      label: `Berechnungsbericht ${source.format.toUpperCase()}`,
      fileName: file.fileName,
      mimeType: file.mimeType,
      storage: file.storage,
      storageStatus: file.storageStatus,
      sourceCalculationReport: true,
      source: "reference",
      metadata: { reportVersion: caseRecord.calculationReportVersion, generatedAt: file.generatedAt, format: source.format },
    });
  }

  const document = caseRecord.documents?.find((item) => item.id === source.documentId);
  if (!document) return null;
  return normalizeCommunicationAttachment({
    id: createAttachmentId(),
    type: "case_document",
    label: document.type,
    fileName: document.fileName,
    mimeType: document.mimeType,
    size: document.size,
    storage: document.storage,
    storageStatus: document.storageStatus,
    sourceDocumentId: document.id,
    source: "reference",
    metadata: {
      documentType: document.type,
      extractionStatus: document.extractionStatus,
    },
  });
}

export async function uploadCommunicationAttachmentFile(
  caseId: string,
  file: File,
  options: { category?: string; ownerId?: string; metadata?: Record<string, unknown> } = {},
) {
  return uploadFileToStorage(file, {
    bucket: storageBuckets.communicationAttachments,
    caseId,
    category: options.category ?? "custom",
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    ownerId: options.ownerId,
    metadata: { fileType: "communication-attachment", ...(options.metadata ?? {}) },
  });
}

export async function buildUploadedCommunicationAttachment(caseId: string, file: File, options: { label?: string; ownerId?: string } = {}): Promise<CommunicationAttachment> {
  const dataUrl = await fileToDataUrl(file);
  let storage: StoredFileMeta | undefined;

  if (shouldUseSupabaseCommunicationAttachmentStorage()) {
    try {
      const uploadResult = await uploadCommunicationAttachmentFile(caseId, file, { ownerId: options.ownerId });
      storage = mapStorageUploadToMeta(uploadResult, { uploadedBy: options.ownerId, source: "storage" });
    } catch (error) {
      storage = normalizeStoredFileMeta(
        { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl },
        {
          uploadedBy: options.ownerId,
          source: "upload",
          storageStatus: "local",
          error: error instanceof Error ? error.message : "Kommunikationsanhang konnte nicht in Storage hochgeladen werden.",
        },
      );
    }
  } else {
    storage = normalizeStoredFileMeta(
      { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl },
      { uploadedBy: options.ownerId, source: "upload", storageStatus: "local" },
    );
  }

  return attachStorageMetaToCommunicationAttachment({
    id: createAttachmentId(),
    type: "custom",
    label: options.label ?? file.name,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    dataUrl,
    source: "upload",
  }, storage);
}

export function attachStorageMetaToCommunicationAttachment(attachment: CommunicationAttachment, meta?: StoredFileMeta): CommunicationAttachment {
  if (!meta) return attachment;
  return normalizeCommunicationAttachment({
    ...attachment,
    storage: meta,
    storageStatus: meta.storageStatus,
    source: meta.source === "storage" ? "storage" : attachment.source,
  });
}

export function normalizeCommunicationAttachment(attachment: CommunicationAttachment): CommunicationAttachment {
  const storage = attachment.storage;
  return {
    ...attachment,
    fileName: attachment.fileName ?? storage?.fileName,
    mimeType: attachment.mimeType ?? storage?.mimeType ?? stringMeta(attachment.metadata?.mimeType),
    size: attachment.size ?? storage?.size ?? numberMeta(attachment.metadata?.size),
    storageStatus: attachment.storageStatus ?? storage?.storageStatus,
    source: attachment.source ?? (storage?.storagePath ? "storage" : attachment.dataUrl ? "legacy" : "reference"),
  };
}

function hasAttachmentOwnContent(attachment: CommunicationAttachment) {
  return Boolean(attachment.dataUrl || attachment.storage?.publicUrl);
}

function attachmentToFileReference(attachment: CommunicationAttachment) {
  const normalized = normalizeCommunicationAttachment(attachment);
  return {
    dataUrl: normalized.dataUrl,
    storage: normalized.storage,
    fileName: normalized.fileName,
    mimeType: normalized.mimeType,
    size: normalized.size,
    storageStatus: normalized.storageStatus,
  };
}

function generatedFileToReference(file: SavedGeneratedFile) {
  return {
    dataUrl: file.dataUrl,
    storage: file.storage,
    fileName: file.fileName,
    mimeType: file.mimeType,
    storageStatus: file.storageStatus,
    generatedAt: file.generatedAt,
  };
}

function documentToReference(document: SavedCaseDocument) {
  return {
    dataUrl: document.dataUrl,
    storage: document.storage,
    fileName: document.fileName,
    mimeType: document.mimeType,
    size: document.size,
    storageStatus: document.storageStatus,
    uploadedAt: document.uploadedAt,
  };
}

function createAttachmentId() {
  return `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function stringMeta(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberMeta(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Anhang konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}
