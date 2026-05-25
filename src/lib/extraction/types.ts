import type { ExtractedData } from "@/types/case";

export type ExtractionDocumentType = "Datenblatt" | "Mietvertrag" | "Richtwert" | "Gutachten";

export type DocumentExtractionStatus =
  | "Wird analysiert"
  | "Text erkannt"
  | "Daten erkannt"
  | "Prüfung erforderlich"
  | "OCR erforderlich"
  | "Optional / nicht hochgeladen";

export type ExtractionIssue = {
  field: string;
  message: string;
};

export type PdfTextQuality = {
  isUsable: boolean;
  reason?: string;
  textLength: number;
  wordCount: number;
  letterRatio: number;
};

export type DocumentExtractionResult = {
  type: ExtractionDocumentType;
  fileName: string;
  status: DocumentExtractionStatus;
  success: boolean;
  requiresOCR: boolean;
  ocrUsed?: boolean;
  textLength: number;
  extractedTextLength: number;
  data: Partial<ExtractedData>;
  issues: ExtractionIssue[];
  warnings?: string[];
  error?: string;
  message?: string;
  quality?: PdfTextQuality;
};

export type ExtractionDocumentKey = "datenblatt" | "mietvertrag" | "richtwert" | "gutachten";

export type ExtractionDocumentsByKey = Partial<Record<ExtractionDocumentKey, DocumentExtractionResult>>;

export type ExtractApiResponse = {
  success: boolean;
  partial?: boolean;
  requiresOCR?: boolean;
  documents: ExtractionDocumentsByKey;
  documentResults?: DocumentExtractionResult[];
  data?: Partial<ExtractedData>;
  mergedData: Partial<ExtractedData>;
  issues: ExtractionIssue[];
  warnings: string[];
  error?: string;
};

export const scannedPdfMessage = "Dieses Dokument scheint gescannt zu sein. OCR wird benötigt.";
