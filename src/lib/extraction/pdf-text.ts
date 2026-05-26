import { scannedPdfMessage, type PdfTextQuality } from "@/lib/extraction/types";

export type PdfTextResult = {
  text: string;
  pages: number;
  requiresOcr: boolean;
};

export async function extractPdfText(file: Blob | ArrayBuffer | Uint8Array): Promise<PdfTextResult> {
  if (typeof window === "undefined") {
    throw new Error("PDF-Textauslesung ist nur im Browser verfügbar.");
  }

  const data = await toPdfData(file);
  if (data.byteLength === 0) {
    throw new Error("file buffer empty");
  }

  const pdfjs = await importPdfJs();
  configurePdfJsWorker(pdfjs);
  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const document = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => ("str" in item ? String(item.str) : "")).join(" ");
    if (pageText) pageTexts.push(pageText);
    page.cleanup();
  }

  await document.destroy();

  const text = normalizePdfText(pageTexts.join("\n\n"));
  return {
    text,
    pages: document.numPages,
    requiresOcr: !assessPdfTextQuality(text).isUsable,
  };
}

type PdfJsModule = {
  GlobalWorkerOptions?: {
    workerSrc?: string;
  };
  getDocument: (options: {
    data: Uint8Array;
    useWorkerFetch?: boolean;
    isEvalSupported?: boolean;
    disableFontFace?: boolean;
    disableWorker?: boolean;
  }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        cleanup: () => void;
      }>;
      destroy: () => Promise<void>;
    }>;
  };
};

async function importPdfJs(): Promise<PdfJsModule> {
  const module = (await import("pdfjs-dist/build/pdf.mjs")) as PdfJsModule;
  return module;
}

function configurePdfJsWorker(pdfjs: PdfJsModule) {
  if (!pdfjs.GlobalWorkerOptions) return;
  if (pdfjs.GlobalWorkerOptions.workerSrc) return;

  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
}

async function toPdfData(file: Blob | ArrayBuffer | Uint8Array) {
  if (file instanceof Uint8Array) {
    return new Uint8Array(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  }

  if (file instanceof ArrayBuffer) {
    return new Uint8Array(file.slice(0));
  }

  return new Uint8Array(await file.arrayBuffer());
}

export function assertTextWasFound(result: PdfTextResult) {
  if (result.requiresOcr) {
    throw new ScannedPdfError(scannedPdfMessage);
  }
}

export function assessPdfTextQuality(text: string): PdfTextQuality {
  const normalized = normalizePdfText(text);
  const textLength = normalized.length;
  const words = normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const letters = normalized.match(/\p{L}/gu) ?? [];
  const visibleCharacters = normalized.replace(/\s/g, "").length;
  const letterRatio = visibleCharacters === 0 ? 0 : roundRatio(letters.length / visibleCharacters);

  if (textLength === 0) {
    return { isUsable: false, reason: "Kein lesbarer PDF-Text erkannt.", textLength, wordCount: 0, letterRatio };
  }

  if (textLength < 100) {
    return { isUsable: false, reason: "PDF-Text ist zu kurz für eine verlässliche Auswertung.", textLength, wordCount: words.length, letterRatio };
  }

  if (words.length < 20) {
    return { isUsable: false, reason: "PDF-Text enthält zu wenige Wörter für eine verlässliche Auswertung.", textLength, wordCount: words.length, letterRatio };
  }

  if (letterRatio < 0.25) {
    return { isUsable: false, reason: "PDF-Text enthält auffällig wenige Buchstaben.", textLength, wordCount: words.length, letterRatio };
  }

  return { isUsable: true, textLength, wordCount: words.length, letterRatio };
}

export class ScannedPdfError extends Error {
  constructor(message = scannedPdfMessage) {
    super(message);
    this.name = "ScannedPdfError";
  }
}

export function normalizePdfText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function roundRatio(value: number) {
  return Math.round(value * 1000) / 1000;
}
