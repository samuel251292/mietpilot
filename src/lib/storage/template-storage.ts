import { normalizeStoredFileMeta } from "@/lib/storage/file-resolver";
import { storageBuckets } from "@/lib/storage/storage-buckets";
import { buildStoragePath, mapStorageUploadToMeta, uploadFileToStorage } from "@/lib/storage/supabase-storage";
import type { StoredWordTemplate } from "@/lib/word-templates";
import type { StoredFileMeta } from "@/types/storage";

export function shouldUseSupabaseTemplateStorage() {
  return (process.env.NEXT_PUBLIC_FILE_STORAGE ?? "local").toLowerCase() === "supabase";
}

export function buildTemplateStoragePath(templateId: string, fileName: string) {
  return buildStoragePath({
    bucket: storageBuckets.templates,
    category: templateId,
    fileName,
  });
}

export async function uploadWordTemplateFile(templateId: string, file: File, ownerId?: string) {
  return uploadFileToStorage(file, {
    bucket: storageBuckets.templates,
    category: templateId,
    fileName: file.name,
    mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ownerId,
    metadata: { templateId, fileType: "word-template" },
    overwrite: true,
  });
}

export async function buildTemplateStorageMeta(templateId: string, file: File, dataUrl: string, ownerId?: string): Promise<StoredFileMeta> {
  const uploadedAt = new Date().toISOString();

  if (shouldUseSupabaseTemplateStorage()) {
    try {
      const uploadResult = await uploadWordTemplateFile(templateId, file, ownerId);
      return mapStorageUploadToMeta(uploadResult, {
        uploadedBy: ownerId,
        source: "storage",
      });
    } catch (error) {
      return normalizeStoredFileMeta(
        { fileName: file.name, mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: file.size, dataUrl },
        {
          uploadedAt,
          uploadedBy: ownerId,
          source: "upload",
          storageStatus: "local",
          error: error instanceof Error ? error.message : "Template-Upload in Storage fehlgeschlagen.",
        },
      );
    }
  }

  return normalizeStoredFileMeta(
    { fileName: file.name, mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: file.size, dataUrl },
    {
      uploadedAt,
      uploadedBy: ownerId,
      source: "upload",
      storageStatus: "local",
    },
  );
}

export function attachStorageMetaToTemplate(template: StoredWordTemplate, meta?: StoredFileMeta): StoredWordTemplate {
  if (!meta) return template;
  return {
    ...template,
    storage: meta,
    storageStatus: meta.storageStatus,
    source: meta.source === "storage" ? "storage" : template.source ?? "upload",
  };
}
