import { normalizeStoredFileMeta } from "@/lib/storage/file-resolver";
import { storageBuckets } from "@/lib/storage/storage-buckets";
import { buildStoragePath, mapStorageUploadToMeta, uploadBlobToStorage } from "@/lib/storage/supabase-storage";
import type { SavedGeneratedFile } from "@/types/case";
import type { StoredFileMeta } from "@/types/storage";

export type GeneratedFileStorageKind = "letter" | "calculation-report";

export type BuildStorageReadyGeneratedFileOptions = {
  caseId: string;
  kind: GeneratedFileStorageKind;
  fileName: string;
  mimeType: string;
  blob: Blob;
  generatedAt?: string;
  generatedBy?: string;
  ownerId?: string;
  letterVersion?: number | string;
  keepDataUrl?: boolean;
};

export function shouldUseSupabaseGeneratedFileStorage() {
  return (process.env.NEXT_PUBLIC_FILE_STORAGE ?? "local").toLowerCase() === "supabase";
}

export function buildGeneratedFileStoragePath(options: {
  caseId: string;
  kind: GeneratedFileStorageKind;
  fileName: string;
  letterVersion?: number | string;
}) {
  return buildStoragePath({
    bucket: options.kind === "letter" ? storageBuckets.generatedLetters : storageBuckets.calculationReports,
    caseId: options.caseId,
    category: options.kind === "letter" ? buildLetterVersionCategory(options.letterVersion) : undefined,
    fileName: options.fileName,
  });
}

export async function uploadGeneratedLetterFile(
  caseId: string,
  letterVersion: number | string | undefined,
  blob: Blob,
  fileName: string,
  mimeType: string,
  ownerId?: string,
) {
  return uploadBlobToStorage(blob, {
    bucket: storageBuckets.generatedLetters,
    caseId,
    category: buildLetterVersionCategory(letterVersion),
    fileName,
    mimeType,
    ownerId,
    metadata: { fileType: "generated-letter", letterVersion },
    overwrite: true,
  });
}

export async function uploadCalculationReportFile(caseId: string, blob: Blob, fileName: string, mimeType: string, ownerId?: string) {
  return uploadBlobToStorage(blob, {
    bucket: storageBuckets.calculationReports,
    caseId,
    fileName,
    mimeType,
    ownerId,
    metadata: { fileType: "calculation-report" },
    overwrite: true,
  });
}

export async function buildStorageReadyGeneratedFile(options: BuildStorageReadyGeneratedFileOptions): Promise<SavedGeneratedFile> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const dataUrl = options.keepDataUrl === false && shouldUseSupabaseGeneratedFileStorage() ? undefined : await blobToDataUrl(options.blob);
  let storage: StoredFileMeta | undefined;

  if (shouldUseSupabaseGeneratedFileStorage()) {
    try {
      const uploadResult = options.kind === "letter"
        ? await uploadGeneratedLetterFile(options.caseId, options.letterVersion, options.blob, options.fileName, options.mimeType, options.ownerId)
        : await uploadCalculationReportFile(options.caseId, options.blob, options.fileName, options.mimeType, options.ownerId);
      storage = mapStorageUploadToMeta(uploadResult, {
        generatedAt,
        generatedBy: options.generatedBy ?? options.ownerId,
        source: "storage",
      });
    } catch (error) {
      storage = normalizeStoredFileMeta(
        { fileName: options.fileName, mimeType: options.mimeType, dataUrl },
        {
          generatedAt,
          generatedBy: options.generatedBy ?? options.ownerId,
          source: dataUrl ? "generated" : "legacy",
          storageStatus: dataUrl ? "local" : "failed",
          error: error instanceof Error ? error.message : "Storage-Upload fehlgeschlagen.",
        },
      );
    }
  } else {
    storage = normalizeStoredFileMeta(
      { fileName: options.fileName, mimeType: options.mimeType, dataUrl },
      {
        generatedAt,
        generatedBy: options.generatedBy ?? options.ownerId,
        source: "generated",
        storageStatus: "local",
      },
    );
  }

  return attachStorageMetaToGeneratedFile(
    {
      fileName: options.fileName,
      mimeType: options.mimeType,
      dataUrl,
      generatedAt,
      source: normalizeGeneratedSource(storage?.source) ?? (dataUrl ? "generated" : "legacy"),
    },
    storage,
  );
}

export function attachStorageMetaToGeneratedFile(file: SavedGeneratedFile, meta?: StoredFileMeta): SavedGeneratedFile {
  if (!meta) return file;
  return {
    ...file,
    storage: meta,
    storageStatus: meta.storageStatus,
    source: normalizeGeneratedSource(meta.source) ?? file.source,
  };
}

function normalizeGeneratedSource(source?: StoredFileMeta["source"]): SavedGeneratedFile["source"] {
  if (source === "storage" || source === "legacy" || source === "generated") return source;
  if (source === "upload") return "generated";
  return undefined;
}

function buildLetterVersionCategory(letterVersion?: number | string) {
  return letterVersion ? `version-${letterVersion}` : "latest";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Datei konnte nicht gespeichert werden."));
    reader.readAsDataURL(blob);
  });
}
