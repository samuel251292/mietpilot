import type { StorageFileReference, StoredFileMeta } from "@/types/storage";

export type ResolvableFile = StorageFileReference & {
  fileName?: string;
  mimeType?: string;
  size?: number;
  source?: StoredFileMeta["source"];
  storageStatus?: StoredFileMeta["storageStatus"];
  generatedAt?: string;
  uploadedAt?: string;
};

export function hasFileContent(file?: ResolvableFile | null) {
  return Boolean(getFileDownloadSource(file));
}

export function hasStorageReference(file?: ResolvableFile | null) {
  return Boolean(file?.storage?.storageBucket && file.storage.storagePath);
}

export function getFileName(file?: ResolvableFile | null) {
  return file?.fileName ?? file?.storage?.fileName ?? "";
}

export function getFileMimeType(file?: ResolvableFile | null) {
  return file?.mimeType ?? file?.storage?.mimeType ?? "application/octet-stream";
}

export function getFileSize(file?: ResolvableFile | null) {
  return file?.size ?? file?.storage?.size;
}

export function getFileDownloadSource(file?: ResolvableFile | null) {
  if (!file) return null;
  return file.dataUrl ?? file.storage?.publicUrl ?? null;
}

export function getBestFileSource(file?: ResolvableFile | null) {
  return getFileDownloadSource(file);
}

export function getFilePreviewSource(file?: ResolvableFile | null) {
  return getFileDownloadSource(file);
}

export async function fileToBlob(file?: ResolvableFile | null) {
  return fetchFileBlob(file);
}

export function canFetchFile(file?: ResolvableFile | null) {
  return Boolean(getBestFileSource(file));
}

export async function fetchFileBlob(file?: ResolvableFile | null) {
  const source = getBestFileSource(file);
  if (!source) return null;
  return fetchBlobSafe(source);
}

export async function fetchFileAsFile(file?: ResolvableFile | null, fallbackFileName?: string, fallbackMimeType?: string) {
  const blob = await fetchFileBlob(file);
  if (!blob) return null;
  return new File([blob], getFileName(file) || fallbackFileName || "document", {
    type: file?.mimeType ?? file?.storage?.mimeType ?? fallbackMimeType ?? blob.type ?? "application/octet-stream",
  });
}

export async function dataUrlToBlobSafe(dataUrl: string) {
  return fetchBlobSafe(dataUrl);
}

async function fetchBlobSafe(source: string) {
  try {
    const response = await fetch(source);
    if (!response.ok) return null;
    return response.blob();
  } catch {
    return null;
  }
}

export function normalizeStoredFileMeta(file?: ResolvableFile | null, fallback: Partial<StoredFileMeta> = {}): StoredFileMeta {
  const storage = file?.storage ?? {};
  const source = storage.source ?? file?.source ?? fallback.source ?? (file?.dataUrl ? "legacy" : undefined);
  const storageStatus = storage.storageStatus ?? file?.storageStatus ?? fallback.storageStatus ?? (storage.storagePath ? "stored" : file?.dataUrl ? "local" : undefined);

  return {
    ...fallback,
    ...storage,
    fileName: storage.fileName ?? file?.fileName ?? fallback.fileName,
    mimeType: storage.mimeType ?? file?.mimeType ?? fallback.mimeType,
    size: storage.size ?? file?.size ?? fallback.size,
    uploadedAt: storage.uploadedAt ?? file?.uploadedAt ?? fallback.uploadedAt,
    generatedAt: storage.generatedAt ?? file?.generatedAt ?? fallback.generatedAt,
    source,
    storageStatus,
  };
}
