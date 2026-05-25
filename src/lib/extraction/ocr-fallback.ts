import { createWorker } from "tesseract.js";

import { normalizePdfText } from "@/lib/extraction/pdf-text";
import type { ExtractionDocumentType } from "@/lib/extraction/types";

const OCR_MAX_PAGES = 3;
const OCR_RENDER_WIDTH = 1600;
const OCR_TIMEOUT_MS = 45_000;
const DEFAULT_OCR_LANGUAGE = "deu";

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

export async function extractTextWithOcrFallback(documentType: ExtractionDocumentType, buffer: Buffer): Promise<OcrFallbackResult> {
  try {
    return await withTimeout(runPdfOcr(documentType, buffer), OCR_TIMEOUT_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: `OCR konnte nicht abgeschlossen werden: ${message}`,
      text: "",
      textLength: 0,
      documentType,
      pagesProcessed: 0,
      requiresOCR: true,
      warnings: ["OCR konnte nicht abgeschlossen werden. Bitte Dokument manuell prüfen."],
    };
  }
}

async function runPdfOcr(documentType: ExtractionDocumentType, buffer: Buffer): Promise<OcrFallbackResult> {
  if (buffer.length === 0) {
    return createFailure(documentType, "PDF-Datei ist leer.", 0);
  }

  const screenshots = await renderPdfPages(buffer);
  if (screenshots.length === 0) {
    return createFailure(documentType, "PDF-Seiten konnten nicht für OCR gerendert werden.", 0);
  }

  const language = process.env.OCR_LANGUAGE || DEFAULT_OCR_LANGUAGE;
  const worker = await createWorker(language);

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "180",
    });

    const pageTexts: string[] = [];

    for (const screenshot of screenshots) {
      const image = Buffer.from(screenshot.data);
      const result = await worker.recognize(image);
      const pageText = normalizePdfText(result.data.text ?? "");
      if (pageText) pageTexts.push(pageText);
    }

    const text = normalizePdfText(pageTexts.join("\n\n"));

    if (!text) {
      return createFailure(documentType, "OCR hat keinen verwertbaren Text erkannt.", screenshots.length);
    }

    return {
      success: true,
      text,
      textLength: text.length,
      documentType,
      pagesProcessed: screenshots.length,
      warnings: [`OCR wurde verwendet. Bitte Werte prüfen. Verarbeitet wurden maximal ${OCR_MAX_PAGES} Seite(n).`],
    };
  } finally {
    await worker.terminate().catch((error: unknown) => {
      console.error("OCR worker terminate failed", error);
    });
  }
}

type PdfScreenshot = {
  data: Uint8Array;
  pageNumber: number;
};

type PdfParseModule = {
  PDFParse: new (options: { data: Uint8Array }) => {
    getScreenshot: (params: { first: number; desiredWidth: number; imageBuffer: boolean; imageDataUrl: boolean }) => Promise<{ pages: PdfScreenshot[] }>;
    destroy: () => Promise<void>;
  };
};

async function renderPdfPages(buffer: Buffer): Promise<PdfScreenshot[]> {
  const module = (await import("pdf-parse")) as typeof import("pdf-parse") & Partial<PdfParseModule>;

  if (typeof module.PDFParse !== "function") {
    throw new Error("PDF-Rendering ist mit der installierten pdf-parse-Version nicht verfügbar.");
  }

  const parser = new module.PDFParse({ data: bufferToOwnedUint8Array(buffer) });

  try {
    const result = await parser.getScreenshot({
      first: OCR_MAX_PAGES,
      desiredWidth: OCR_RENDER_WIDTH,
      imageBuffer: true,
      imageDataUrl: false,
    });

    return result.pages.filter((page) => page.data && page.data.length > 0);
  } finally {
    await parser.destroy().catch((error: unknown) => {
      console.error("OCR PDF parser destroy failed", error);
    });
  }
}

function createFailure(documentType: ExtractionDocumentType, error: string, pagesProcessed: number): OcrFallbackResult {
  return {
    success: false,
    error,
    text: "",
    textLength: 0,
    documentType,
    pagesProcessed,
    requiresOCR: true,
    warnings: ["OCR konnte keinen verwertbaren Text liefern. Bitte Dokument manuell prüfen."],
  };
}

function bufferToOwnedUint8Array(buffer: Buffer) {
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`OCR-Zeitlimit nach ${Math.round(timeoutMs / 1000)} Sekunden erreicht.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
