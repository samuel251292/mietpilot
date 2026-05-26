import { normalizePdfText } from "@/lib/extraction/parser-utils";
import type { ExtractionDocumentType } from "@/lib/extraction/types";

const DEFAULT_OCR_LANGUAGE = "deu";

export type OcrFallbackResult =
  | {
      success: true;
      text: string;
      textLength: number;
      documentType?: ExtractionDocumentType;
      pagesProcessed: number;
      warnings: string[];
    }
  | {
      success: false;
      error: string;
      text: "";
      textLength: 0;
      documentType?: ExtractionDocumentType;
      pagesProcessed: number;
      requiresOCR: true;
      warnings: string[];
    };

export async function runBrowserOcrOnImages(images: Blob[], language = getBrowserOcrLanguage()): Promise<OcrFallbackResult> {
  if (typeof window === "undefined") {
    return createFailure("OCR ist nur im Browser verfügbar.", 0);
  }

  if (images.length === 0) {
    return createFailure("Keine renderbaren PDF-Seiten für OCR gefunden.", 0);
  }

  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(language);

    try {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "180",
      });

      const pageTexts: string[] = [];

      for (const image of images) {
        const result = await worker.recognize(image);
        const pageText = normalizePdfText(result.data.text ?? "");
        if (pageText) pageTexts.push(pageText);
      }

      const text = normalizePdfText(pageTexts.join("\n\n"));
      if (!text) return createFailure("OCR hat keinen verwertbaren Text erkannt.", images.length);

      return {
        success: true,
        text,
        textLength: text.length,
        pagesProcessed: images.length,
        warnings: ["OCR-Text erkannt. Bitte Werte prüfen."],
      };
    } finally {
      await worker.terminate().catch(() => undefined);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createFailure(message, images.length);
  }
}

export async function extractTextWithOcrFallback(documentType: ExtractionDocumentType): Promise<OcrFallbackResult> {
  return {
    ...createFailure("OCR muss im Browser vor dem API-Aufruf ausgeführt werden.", 0),
    documentType,
  };
}

function createFailure(error: string, pagesProcessed: number): OcrFallbackResult {
  return {
    success: false,
    error,
    text: "",
    textLength: 0,
    pagesProcessed,
    requiresOCR: true,
    warnings: ["OCR nicht möglich. Bitte Dokument manuell prüfen oder eine PDF mit eingebettetem Text hochladen."],
  };
}

function getBrowserOcrLanguage() {
  return process.env.NEXT_PUBLIC_OCR_LANGUAGE || DEFAULT_OCR_LANGUAGE;
}
