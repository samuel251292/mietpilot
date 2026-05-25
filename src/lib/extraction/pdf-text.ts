import { scannedPdfMessage, type PdfTextQuality } from "@/lib/extraction/types";

export type PdfTextResult = {
  text: string;
  pages: number;
  requiresOcr: boolean;
};

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  if (buffer.length === 0) {
    throw new Error("file buffer empty");
  }

  const pdfParseModule = await importPdfParse();

  if (pdfParseModule.kind === "legacy") {
    const result = await pdfParseModule.parse(buffer);
    const text = normalizePdfText(result.text ?? "");
    return {
      text,
      pages: result.numpages ?? 0,
      requiresOcr: !assessPdfTextQuality(text).isUsable,
    };
  }

  const data = bufferToOwnedUint8Array(buffer);
  const parser = new pdfParseModule.PDFParse({ data });

  try {
    const result = await parser.getText();
    const text = normalizePdfText(result.text ?? "");

    return {
      text,
      pages: result.total,
      requiresOcr: !assessPdfTextQuality(text).isUsable,
    };
  } finally {
    await parser.destroy().catch((error: unknown) => {
      console.error("pdf-parse destroy failed", error);
    });
  }
}

type PdfParseModule =
  | {
      kind: "modern";
      PDFParse: new (options: { data: Uint8Array }) => {
        getText: () => Promise<{ text?: string; total: number }>;
        destroy: () => Promise<void>;
      };
    }
  | {
      kind: "legacy";
      parse: (buffer: Buffer) => Promise<{ text?: string; numpages?: number }>;
    };

async function importPdfParse(): Promise<PdfParseModule> {
  try {
    const module = await import("pdf-parse");
    const maybeModern = module as typeof module & {
      PDFParse?: PdfParseModule extends { kind: "modern"; PDFParse: infer T } ? T : never;
      default?: unknown;
    };

    if (typeof maybeModern.PDFParse === "function") {
      return { kind: "modern", PDFParse: maybeModern.PDFParse };
    }

    if (typeof maybeModern.default === "function") {
      return { kind: "legacy", parse: maybeModern.default as (buffer: Buffer) => Promise<{ text?: string; numpages?: number }> };
    }

    throw new Error(`pdf-parse import failed: exports=${Object.keys(module).join(", ") || "none"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`pdf-parse import failed: ${message}`);
  }
}

function bufferToOwnedUint8Array(buffer: Buffer) {
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
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
