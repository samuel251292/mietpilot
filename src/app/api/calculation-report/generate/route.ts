import PizZip from "pizzip";
import { buildCalculationReport } from "@/lib/calculation";
import { buildCalculationReportTemplateData } from "@/lib/calculation/report-export";
import { convertViaConvertApi } from "@/lib/pdf/convert-via-convertapi";
import type { SavedCaseRecord } from "@/types/case";

export const runtime = "nodejs";

const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pdfMime = "application/pdf";

type GenerateReportRequest = {
  record?: SavedCaseRecord;
  format?: "docx" | "pdf";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateReportRequest;
    if (!body.record) return Response.json({ error: "Falldaten fehlen." }, { status: 400 });

    const record = ensureReport(body.record);
    const templateData = buildCalculationReportTemplateData(record);
    const docxBuffer = createReportDocxBuffer(templateData);
    const conversion = body.format === "pdf" ? await convertViaConvertApi(docxBuffer, `${templateData.fileBaseName}.docx`) : undefined;

    return Response.json({
      docx: {
        fileName: `${templateData.fileBaseName}.docx`,
        mimeType: docxMime,
        base64: docxBuffer.toString("base64"),
      },
      pdf: conversion?.pdfBuffer
        ? {
            fileName: `${templateData.fileBaseName}.pdf`,
            mimeType: pdfMime,
            base64: conversion.pdfBuffer.toString("base64"),
          }
        : null,
      pdfError: conversion?.error,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Berechnungsbericht konnte nicht erstellt werden." },
      { status: 500 },
    );
  }
}

function ensureReport(record: SavedCaseRecord): SavedCaseRecord {
  if (record.calculationReport) return record;
  return {
    ...record,
    calculationReport: buildCalculationReport(record.calculation, record.calculation, record.extracted, { generatedAt: record.updatedAt }),
  };
}

function createReportDocxBuffer(data: ReturnType<typeof buildCalculationReportTemplateData>) {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", contentTypesXml());
  zip.folder("_rels")?.file(".rels", packageRelsXml());
  zip.folder("docProps")?.file("core.xml", coreXml(data.generatedAt));
  zip.folder("docProps")?.file("app.xml", appXml());
  zip.folder("word")?.file("document.xml", documentXml(data));
  zip.folder("word")?.folder("_rels")?.file("document.xml.rels", documentRelsXml());
  zip.folder("word")?.file("styles.xml", stylesXml());

  return zip.generate({ type: "nodebuffer", mimeType: docxMime }) as Buffer;
}

function documentXml(data: ReturnType<typeof buildCalculationReportTemplateData>) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph(data.title, "Title")}
    ${paragraph(`Fall: ${data.caseId}`, "Subtitle")}
    ${paragraph(`Mieter: ${data.tenant}`, "Normal")}
    ${paragraph(`Adresse: ${data.address}`, "Normal")}
    ${paragraph(`Erstellt: ${formatDate(data.generatedAt)}`, "Normal")}
    ${data.sections.map((section) => `
      ${paragraph(section.title, "Heading1")}
      ${section.entries.map((entry) => paragraph(`${entry.label}: ${entry.formattedValue ?? String(entry.value ?? "Fehlt")}${entry.overridden ? " (Manuell angepasst)" : entry.source ? ` (Quelle: ${entry.source})` : ""}${entry.warning && !entry.overridden ? ` - ${entry.warning}` : ""}`, entry.warning ? "Warning" : "Normal")).join("")}
    `).join("")}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
  </w:body>
</w:document>`;
}

function paragraph(text: string, style: "Title" | "Subtitle" | "Heading1" | "Warning" | "Normal") {
  return `<w:p><w:pPr>${style !== "Normal" ? `<w:pStyle w:val="${style}"/>` : ""}</w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function packageRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function documentRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:rPr><w:b/><w:color w:val="475569"/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Warning"><w:name w:val="Warning"/><w:rPr><w:b/><w:color w:val="92400E"/><w:sz w:val="22"/></w:rPr></w:style>
</w:styles>`;
}

function coreXml(createdAt: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>MAWA Berechnungsbericht</dc:title>
  <dc:creator>MAWA CRM</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(createdAt)}</dcterms:created>
</cp:coreProperties>`;
}

function appXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>MAWA CRM</Application></Properties>`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
