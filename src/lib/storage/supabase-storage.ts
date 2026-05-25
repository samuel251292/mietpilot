import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/services/supabase";
import type { StoredFileMeta } from "@/types/storage";
import type { StorageBucketName } from "@/lib/storage/storage-buckets";
import { storageBuckets } from "@/lib/storage/storage-buckets";

export type StorageUploadOptions = {
  bucket: StorageBucketName;
  caseId?: string;
  category?: string;
  fileName: string;
  mimeType?: string;
  ownerId?: string;
  overwrite?: boolean;
  metadata?: Record<string, unknown>;
};

export type StorageUploadResult = {
  bucket: StorageBucketName;
  path: string;
  publicUrl?: string;
  fileName: string;
  mimeType?: string;
  size?: number;
  uploadedAt: string;
  storageStatus: "stored";
};

export function isStorageConfigured() {
  return isSupabaseConfigured();
}

export function buildStoragePath(options: StorageUploadOptions) {
  const fileName = sanitizeStorageSegment(options.fileName, "file");
  const category = options.category ? sanitizeStorageSegment(options.category, "general") : undefined;
  const caseId = options.caseId ? sanitizeStorageSegment(options.caseId, "case") : undefined;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const stampedFileName = `${timestamp}-${fileName}`;

  if (options.bucket === storageBuckets.caseDocuments) {
    return joinPath(caseId ?? "unassigned", category ?? "documents", stampedFileName);
  }

  if (options.bucket === storageBuckets.generatedLetters) {
    return joinPath(caseId ?? "unassigned", category ?? "latest", fileName);
  }

  if (options.bucket === storageBuckets.calculationReports) {
    return joinPath(caseId ?? "unassigned", fileName);
  }

  if (options.bucket === storageBuckets.communicationAttachments) {
    return joinPath(caseId ?? "unassigned", category ?? "attachments", stampedFileName);
  }

  if (options.bucket === storageBuckets.templates) {
    return joinPath(category ?? "default", fileName);
  }

  if (options.bucket === storageBuckets.companyAssets) {
    return joinPath(category ?? "general", fileName);
  }

  return joinPath(category ?? caseId ?? "general", stampedFileName);
}

export async function uploadFileToStorage(file: File, options: Omit<StorageUploadOptions, "fileName" | "mimeType"> & { fileName?: string; mimeType?: string }) {
  return uploadBlobToStorage(file, {
    ...options,
    fileName: options.fileName ?? file.name,
    mimeType: options.mimeType ?? file.type,
  });
}

export async function uploadBlobToStorage(blob: Blob, options: StorageUploadOptions): Promise<StorageUploadResult> {
  const client = requireStorageClient();
  const path = buildStoragePath(options);
  const uploadedAt = new Date().toISOString();
  const mimeType = options.mimeType || blob.type || "application/octet-stream";

  const { error } = await client.storage.from(options.bucket).upload(path, blob, {
    contentType: mimeType,
    upsert: Boolean(options.overwrite),
    metadata: {
      ...(options.metadata ?? {}),
      ownerId: options.ownerId,
      caseId: options.caseId,
      originalFileName: options.fileName,
    },
  });

  if (error) throw new Error(`Datei konnte nicht in Supabase Storage hochgeladen werden. ${error.message}`);

  return {
    bucket: options.bucket,
    path,
    publicUrl: getPublicFileUrl(options.bucket, path) ?? undefined,
    fileName: options.fileName,
    mimeType,
    size: blob.size,
    uploadedAt,
    storageStatus: "stored",
  };
}

export function getPublicFileUrl(bucket: StorageBucketName, path: string) {
  const client = requireStorageClient();
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl || null;
}

export async function createSignedFileUrl(bucket: StorageBucketName, path: string, expiresIn = 60 * 60) {
  const client = requireStorageClient();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw new Error(`Signierte Datei-URL konnte nicht erstellt werden. ${error.message}`);
  return data.signedUrl;
}

export async function deleteStorageFile(bucket: StorageBucketName, path: string) {
  const client = requireStorageClient();
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw new Error(`Storage-Datei konnte nicht gelöscht werden. ${error.message}`);
}

export async function downloadStorageFile(bucket: StorageBucketName, path: string) {
  const client = requireStorageClient();
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error) throw new Error(`Storage-Datei konnte nicht geladen werden. ${error.message}`);
  return data;
}

export function mapStorageUploadToMeta(result: StorageUploadResult, fallback: Partial<StoredFileMeta> = {}): StoredFileMeta {
  return {
    ...fallback,
    storageBucket: result.bucket,
    storagePath: result.path,
    publicUrl: result.publicUrl ?? fallback.publicUrl,
    fileName: result.fileName,
    mimeType: result.mimeType ?? fallback.mimeType,
    size: result.size ?? fallback.size,
    uploadedAt: result.uploadedAt,
    source: "storage",
    storageStatus: result.storageStatus,
  };
}

function requireStorageClient() {
  const client = createBrowserSupabaseClient();
  if (!client) {
    throw new Error("Supabase Storage ist nicht konfiguriert. Bitte NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY setzen.");
  }
  return client;
}

function joinPath(...segments: Array<string | undefined>) {
  return segments.filter(Boolean).join("/");
}

function sanitizeStorageSegment(value: string, fallback: string) {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return sanitized || fallback;
}
