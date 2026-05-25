import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { buildLetterTemplateData, toDocxTemplateData } from "@/lib/letters/letter-data";
import { convertViaConvertApi } from "@/lib/pdf/convert-via-convertapi";
import type { SavedCaseRecord } from "@/types/case";

export const runtime = "nodejs";

const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pdfMime = "application/pdf";

type GenerateRequest = {
  templateDataUrl?: string;
  values?: Record<string, string>;
  caseRecord?: SavedCaseRecord;
  fileBaseName?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequest;

    const values = body.values ?? (body.caseRecord ? toDocxTemplateData(buildLetterTemplateData(body.caseRecord)) : undefined);

    if (!body.templateDataUrl || !values) {
      return Response.json({ error: "Vorlage oder Falldaten fehlen." }, { status: 400 });
    }

    const fileBaseName = sanitizeFileName(body.fileBaseName || "Vergleichsschreiben");
    const docxBuffer = createDocxBuffer(body.templateDataUrl, values);
    const conversion = await convertViaConvertApi(docxBuffer, `${fileBaseName}.docx`);

    return Response.json({
      docx: {
        fileName: `${fileBaseName}.docx`,
        mimeType: docxMime,
        base64: docxBuffer.toString("base64"),
      },
      pdf: conversion.pdfBuffer
        ? {
            fileName: `${fileBaseName}.pdf`,
            mimeType: pdfMime,
            base64: conversion.pdfBuffer.toString("base64"),
          }
        : null,
      pdfError: conversion.error,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dokumente konnten nicht erstellt werden." },
      { status: 500 },
    );
  }
}

function createDocxBuffer(templateDataUrl: string, values: Record<string, string>) {
  const zip = new PizZip(dataUrlToBuffer(templateDataUrl));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: {
      start: "{{",
      end: "}}",
    },
  });

  doc.render(values);

  return doc.getZip().generate({
    type: "nodebuffer",
    mimeType: docxMime,
  }) as Buffer;
}

function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Die Word-Vorlage konnte nicht gelesen werden.");
  return Buffer.from(base64, "base64");
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90) || "Vergleichsschreiben";
}
