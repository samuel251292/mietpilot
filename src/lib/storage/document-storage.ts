import { normalizeStoredFileMeta } from "@/lib/storage/file-resolver";
import { storageBuckets } from "@/lib/storage/storage-buckets";
import { mapStorageUploadToMeta, uploadFileToStorage } from "@/lib/storage/supabase-storage";
import type { SavedCaseDocument } from "@/types/case";
import type { StoredFileMeta } from "@/types/storage";

export type BuildSavedCaseDocumentOptions = {
  id?: string;
  uploadedAt?: string;
  ownerId?: string;
  keepDataUrl?: boolean;
};

export function shouldUseSupabaseStorage() {
  return (process.env.NEXT_PUBLIC_FILE_STORAGE ?? "local").toLowerCase() === "supabase";
}

export async function uploadCaseDocumentFile(caseId: string, documentType: SavedCaseDocument["type"], file: File, ownerId?: string) {
  return uploadFileToStorage(file, {
    bucket: storageBuckets.caseDocuments,
    caseId,
    category: documentType,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    ownerId,
    metadata: { documentType },
  });
}

export async function buildSavedCaseDocumentFromFile(
  caseId: string,
  documentType: SavedCaseDocument["type"],
  file: File,
  options: BuildSavedCaseDocumentOptions = {},
): Promise<SavedCaseDocument> {
  const uploadedAt = options.uploadedAt ?? new Date().toISOString();
  const dataUrl = options.keepDataUrl === false && shouldUseSupabaseStorage() ? undefined : await blobToDataUrl(file);
  let storage: StoredFileMeta | undefined;

  if (shouldUseSupabaseStorage()) {
    try {
      const uploadResult = await uploadCaseDocumentFile(caseId, documentType, file, options.ownerId);
      storage = mapStorageUploadToMeta(uploadResult, {
        uploadedBy: options.ownerId,
        source: "storage",
      });
    } catch (error) {
      storage = normalizeStoredFileMeta(
        { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl },
        {
          uploadedAt,
          uploadedBy: options.ownerId,
          source: dataUrl ? "upload" : "legacy",
          storageStatus: dataUrl ? "local" : "failed",
          error: error instanceof Error ? error.message : "Storage-Upload fehlgeschlagen.",
        },
      );
    }
  } else {
    storage = normalizeStoredFileMeta(
      { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl },
      {
        uploadedAt,
        uploadedBy: options.ownerId,
        source: "upload",
        storageStatus: "local",
      },
    );
  }

  return attachStorageMetaToDocument(
    {
      id: options.id ?? createDocumentId(documentType, file.name, uploadedAt),
      type: documentType,
      fileName: file.name,
      uploadedAt,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      dataUrl,
      extractionStatus: documentType === "Weitere Dokumente" ? "not_applicable" : "pending",
      source: storage?.source ?? (dataUrl ? "upload" : "legacy"),
    },
    storage,
  );
}

export function attachStorageMetaToDocument(document: SavedCaseDocument, meta?: StoredFileMeta): SavedCaseDocument {
  if (!meta) return document;
  return {
    ...document,
    storage: meta,
    storageStatus: meta.storageStatus,
    source: meta.source ?? document.source,
  };
}

function createDocumentId(type: SavedCaseDocument["type"], fileName: string, uploadedAt: string) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const slug = `${type}-${fileName}-${uploadedAt}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return `doc_${slug}_${suffix}`;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Datei konnte nicht gespeichert werden."));
    reader.readAsDataURL(blob);
  });
}
