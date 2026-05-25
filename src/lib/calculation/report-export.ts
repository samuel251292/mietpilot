import type { CalculationReport, SavedCaseRecord } from "@/types/case";

const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pdfMime = "application/pdf";

export type CalculationReportTemplateData = {
  fileBaseName: string;
  title: string;
  caseId: string;
  tenant: string;
  address: string;
  generatedAt: string;
  sections: CalculationReport["sections"];
  warnings: string[];
};

export type CalculationReportExportFile = {
  fileName: string;
  mimeType: string;
  base64: string;
};

export type CalculationReportExportResult = {
  docx: CalculationReportExportFile;
  pdf: CalculationReportExportFile | null;
  pdfError?: string;
};

export function buildCalculationReportTemplateData(record: SavedCaseRecord): CalculationReportTemplateData {
  if (!record.calculationReport) {
    throw new Error("Berechnungsbericht fehlt.");
  }

  return {
    fileBaseName: createReportFileBaseName(record),
    title: "MAWA Berechnungsbericht",
    caseId: record.id,
    tenant: record.tenant || "Mieter fehlt",
    address: record.address || "Adresse fehlt",
    generatedAt: record.calculationReport.generatedAt,
    sections: record.calculationReport.sections,
    warnings: record.calculationReport.warnings ?? [],
  };
}

export async function generateCalculationReportDocx(record: SavedCaseRecord) {
  const result = await requestCalculationReportExport(record, "docx");
  return result.docx;
}

export async function generateCalculationReportPdf(record: SavedCaseRecord) {
  return requestCalculationReportExport(record, "pdf");
}

export function getReportDocxMime() {
  return docxMime;
}

export function getReportPdfMime() {
  return pdfMime;
}

async function requestCalculationReportExport(record: SavedCaseRecord, format: "docx" | "pdf"): Promise<CalculationReportExportResult> {
  const response = await fetch("/api/calculation-report/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ record, format }),
  });
  const result = (await response.json()) as CalculationReportExportResult & { error?: string };

  if (!response.ok) {
    throw new Error(result.error || "Berechnungsbericht konnte nicht erstellt werden.");
  }

  return result;
}

function createReportFileBaseName(record: SavedCaseRecord) {
  const date = new Date().toISOString().slice(0, 10);
  const caseId = sanitizeFileName(record.id || "Fall");
  return `MAWA_Berechnungsbericht_${caseId}_${date}`;
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90) || "Berechnungsbericht";
}
