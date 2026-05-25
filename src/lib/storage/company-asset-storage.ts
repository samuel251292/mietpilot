import type { CompanyProfile } from "@/lib/company-profile";
import { normalizeStoredFileMeta } from "@/lib/storage/file-resolver";
import { storageBuckets } from "@/lib/storage/storage-buckets";
import { buildStoragePath, mapStorageUploadToMeta, uploadFileToStorage } from "@/lib/storage/supabase-storage";
import type { StoredFileMeta } from "@/types/storage";

export type CompanyAssetType = "logo" | "signature" | "letterhead";

export function shouldUseSupabaseCompanyAssetStorage() {
  return (process.env.NEXT_PUBLIC_FILE_STORAGE ?? "local").toLowerCase() === "supabase";
}

export function buildCompanyAssetStoragePath(assetType: CompanyAssetType, fileName: string) {
  return buildStoragePath({
    bucket: storageBuckets.companyAssets,
    category: assetType,
    fileName,
  });
}

export async function uploadCompanyAssetFile(assetType: CompanyAssetType, file: File, ownerId?: string) {
  return uploadFileToStorage(file, {
    bucket: storageBuckets.companyAssets,
    category: assetType,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    ownerId,
    metadata: { assetType, fileType: "company-asset" },
    overwrite: true,
  });
}

export async function buildCompanyAssetStorageMeta(assetType: CompanyAssetType, file: File, dataUrl: string, ownerId?: string): Promise<StoredFileMeta> {
  const uploadedAt = new Date().toISOString();

  if (shouldUseSupabaseCompanyAssetStorage()) {
    try {
      const uploadResult = await uploadCompanyAssetFile(assetType, file, ownerId);
      return mapStorageUploadToMeta(uploadResult, {
        uploadedBy: ownerId,
        source: "storage",
      });
    } catch (error) {
      return normalizeStoredFileMeta(
        { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl },
        {
          uploadedAt,
          uploadedBy: ownerId,
          source: "upload",
          storageStatus: "local",
          error: error instanceof Error ? error.message : "Company-Asset-Upload in Storage fehlgeschlagen.",
        },
      );
    }
  }

  return normalizeStoredFileMeta(
    { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl },
    {
      uploadedAt,
      uploadedBy: ownerId,
      source: "upload",
      storageStatus: "local",
    },
  );
}

export function attachStorageMetaToCompanyProfile(profile: CompanyProfile, assetType: CompanyAssetType, meta?: StoredFileMeta): CompanyProfile {
  if (!meta) return profile;

  if (assetType === "signature") {
    return { ...profile, signatureStorage: meta };
  }

  if (assetType === "letterhead") {
    return { ...profile, letterheadStorage: meta };
  }

  return { ...profile, logoStorage: meta };
}
