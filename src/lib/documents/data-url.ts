import type { SavedCaseDocument } from "@/types/case";
import { canFetchFile } from "@/lib/storage/file-resolver";

export async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function dataUrlToFile(dataUrl: string, fileName: string, mimeType?: string) {
  const blob = await dataUrlToBlob(dataUrl);
  return new File([blob], fileName, { type: mimeType || blob.type || "application/octet-stream" });
}

export function isDocumentReExtractable(document: SavedCaseDocument) {
  return canFetchFile(document) && document.type !== "Weitere Dokumente";
}
