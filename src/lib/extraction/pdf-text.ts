import { assessPdfTextQuality, normalizePdfText } from "@/lib/extraction/parser-utils";
import { runBrowserOcrOnImages } from "@/lib/extraction/ocr-fallback";
import { scannedPdfMessage } from "@/lib/extraction/types";

const OCR_MAX_PAGES = 2;
const OCR_RENDER_WIDTH = 1600;

export type PdfExtractionStatus = "text" | "ocr-started" | "ocr-success" | "ocr-failed";

export type PdfTextResult = {
  text: string;
  pages: number;
  requiresOcr: boolean;
  ocrAttempted?: boolean;
  ocrUsed?: boolean;
  ocrError?: string;
  warnings?: string[];
};

export type PdfTextOptions = {
  onStatus?: (status: PdfExtractionStatus) => void;
};

export async function extractPdfText(file: Blob | ArrayBuffer | Uint8Array, options: PdfTextOptions = {}): Promise<PdfTextResult> {
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
  try {
    const text = await extractTextFromPdfDocument(document);
    const quality = assessPdfTextQuality(text);
    if (quality.isUsable) {
      options.onStatus?.("text");
      return {
        text,
        pages: document.numPages,
        requiresOcr: false,
        warnings: [],
      };
    }

    options.onStatus?.("ocr-started");
    const ocrImages = await renderPdfPagesForOcr(document);
    const ocrResult = await runBrowserOcrOnImages(ocrImages);
    if (ocrResult.success) {
      options.onStatus?.("ocr-success");
      return {
        text: ocrResult.text,
        pages: document.numPages,
        requiresOcr: false,
        ocrAttempted: true,
        ocrUsed: true,
        warnings: [
          "OCR versucht.",
          `OCR-Text erkannt. Verarbeitet wurden maximal ${OCR_MAX_PAGES} Seite(n).`,
          "OCR wurde verwendet. Bitte Werte prüfen.",
          ...ocrResult.warnings,
        ],
      };
    }

    options.onStatus?.("ocr-failed");
    return {
      text,
      pages: document.numPages,
      requiresOcr: true,
      ocrAttempted: true,
      ocrUsed: false,
      ocrError: ocrResult.error,
      warnings: ["OCR versucht.", `OCR fehlgeschlagen: ${ocrResult.error}`, "OCR nicht möglich.", quality.reason].filter(Boolean) as string[],
    };
  } finally {
    await document.destroy();
  }
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
        getViewport: (options: { scale: number }) => { width: number; height: number };
        render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
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

async function extractTextFromPdfDocument(document: PdfDocument) {
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => ("str" in item ? String(item.str) : "")).join(" ");
    if (pageText) pageTexts.push(pageText);
    page.cleanup();
  }

  return normalizePdfText(pageTexts.join("\n\n"));
}

async function renderPdfPagesForOcr(document: PdfDocument) {
  const images: Blob[] = [];
  const pageLimit = Math.min(document.numPages, OCR_MAX_PAGES);

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const defaultViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(1, OCR_RENDER_WIDTH / Math.max(defaultViewport.width, 1));
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");

    if (!context) {
      page.cleanup();
      continue;
    }

    await page.render({ canvasContext: context, viewport }).promise;
    const image = await canvasToPngBlob(canvas);
    if (image) images.push(image);
    page.cleanup();
  }

  return images;
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

type PdfDocument = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;

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

export class ScannedPdfError extends Error {
  constructor(message = scannedPdfMessage) {
    super(message);
    this.name = "ScannedPdfError";
  }
}
