export type StoredFileMeta = {
  storageBucket?: string;
  storagePath?: string;
  publicUrl?: string;
  signedUrlExpiresAt?: string;

  fileName?: string;
  mimeType?: string;
  size?: number;
  checksum?: string;

  uploadedAt?: string;
  uploadedBy?: string;
  generatedAt?: string;
  generatedBy?: string;

  source?: "upload" | "generated" | "legacy" | "storage";

  storageStatus?: "local" | "uploading" | "stored" | "failed" | "legacy";

  error?: string;
  metadata?: Record<string, unknown>;
};

export type StorageFileReference = {
  id?: string;
  dataUrl?: string;
  storage?: StoredFileMeta;
};
