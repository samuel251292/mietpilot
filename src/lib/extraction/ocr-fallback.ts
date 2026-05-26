import type { ExtractionDocumentType } from "@/lib/extraction/types";

export type OcrFallbackResult =
  | {
      success: true;
      text: string;
      textLength: number;
      documentType: ExtractionDocumentType;
      pagesProcessed: number;
      warnings: string[];
    }
  | {
      success: false;
      error: string;
      text: "";
      textLength: 0;
      documentType: ExtractionDocumentType;
      pagesProcessed: number;
      requiresOCR: true;
      warnings: string[];
    };

export async function extractTextWithOcrFallback(documentType: ExtractionDocumentType): Promise<OcrFallbackResult> {
  return {
    success: false,
    error: "OCR ist im Vercel-Testdeployment serverseitig deaktiviert, damit keine PDF-Browser-APIs auf dem Server geladen werden.",
    text: "",
    textLength: 0,
    documentType,
    pagesProcessed: 0,
    requiresOCR: true,
    warnings: ["OCR erforderlich. Bitte Dokument manuell prüfen oder eine PDF mit eingebettetem Text hochladen."],
  };
}
