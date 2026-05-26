import { NextResponse } from "next/server";

import { extractDatenblatt } from "@/lib/extraction/extract-datenblatt";
import { extractMietvertrag } from "@/lib/extraction/extract-mietvertrag";
import { extractRichtwert } from "@/lib/extraction/extract-richtwert";
import { extractTextWithOcrFallback } from "@/lib/extraction/ocr-fallback";
import { assessPdfTextQuality, normalizePdfText } from "@/lib/extraction/parser-utils";
import type { DocumentExtractionResult, ExtractionDocumentKey, ExtractionDocumentType } from "@/lib/extraction/types";
import { scannedPdfMessage } from "@/lib/extraction/types";
import type { ExtractedData } from "@/types/case";

export const runtime = "nodejs";

const documentTypes: ExtractionDocumentType[] = ["Datenblatt", "Mietvertrag", "Richtwert", "Gutachten"];

export function GET() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}

export async function POST(request: Request) {
  try {
    let formData: FormData;

    try {
      formData = await request.formData();
    } catch (error) {
      console.error("Extraktions-API: FormData konnte nicht gelesen werden.", error);
      return json(createFailureResponse("Upload konnte nicht gelesen werden"), 400);
    }

    const documents = await Promise.all(
      documentTypes.flatMap((type) => {
        const texts = formData.getAll(`${type}__text`).map((value) => (typeof value === "string" ? value : ""));
        const pages = formData.getAll(`${type}__pages`).map((value) => (typeof value === "string" ? Number(value) : 0));

        return formData
          .getAll(type)
          .filter(isUploadedFile)
          .map((file, index) => parseDocument(type, file, { text: texts[index] ?? "", pages: pages[index] ?? 0 }));
      }),
    );

    if (documents.length === 0) {
      return json(createFailureResponse("Keine PDF-Dateien für die Extraktion gefunden."), 400);
    }

    const data = mergeExtractedDocuments(documents.filter((document) => document.success));
    const issues = documents.flatMap((document) => document.issues);
    const warnings = documents
      .filter((document) => !document.success || document.issues.length > 0 || (document.warnings?.length ?? 0) > 0)
      .map((document) => `${document.type}: ${document.error || document.message || document.warnings?.[0] || "Bitte prüfen"}`);
    const partial = documents.some((document) => !document.success);

    return json({
      success: true,
      partial,
      requiresOCR: documents.some((document) => document.requiresOCR),
      documents: toDocumentsByKey(documents),
      documentResults: documents,
      data,
      mergedData: data,
      issues,
      warnings,
    });
  } catch (error) {
    console.error("Extraktions-API: Unerwarteter Fehler.", error);
    return json(createFailureResponse("Die Datenextraktion ist fehlgeschlagen."), 500);
  }
}

async function parseDocument(type: ExtractionDocumentType, file: File, clientTextResult?: { text: string; pages?: number }): Promise<DocumentExtractionResult> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return {
      type,
      fileName: file.name,
      status: "Prüfung erforderlich",
      success: false,
      requiresOCR: false,
      textLength: 0,
      extractedTextLength: 0,
      data: {},
      issues: [{ field: type, message: "Nur PDF-Dateien können derzeit automatisch ausgelesen werden." }],
      error: "Nur PDF-Dateien können derzeit automatisch ausgelesen werden.",
      message: "Nur PDF-Dateien können derzeit automatisch ausgelesen werden.",
    };
  }

  try {
    const clientText = normalizePdfText(clientTextResult?.text ?? "");
    const text = clientText;

    if (!text) {
      return {
        type,
        fileName: file.name,
        status: "Prüfung erforderlich",
        success: false,
        requiresOCR: false,
        textLength: 0,
        extractedTextLength: 0,
        data: {},
        issues: [{ field: type, message: "PDF-Text konnte im Browser nicht gelesen werden. Bitte Dokument manuell prüfen." }],
        error: "PDF-Text konnte im Browser nicht gelesen werden.",
        message: "PDF-Text konnte im Browser nicht gelesen werden. Bitte Dokument manuell prüfen.",
      };
    }

    const quality = assessPdfTextQuality(text);

    if (!quality.isUsable) {
      const ocrResult = await extractTextWithOcrFallback(type);

      if (!ocrResult.success) {
        return {
          type,
          fileName: file.name,
          status: "OCR erforderlich",
          success: false,
          requiresOCR: true,
          ocrUsed: false,
          textLength: text.length,
          extractedTextLength: 0,
          data: {},
          issues: [{ field: type, message: quality.reason || "Bitte prüfen" }],
          warnings: [quality.reason, ...ocrResult.warnings].filter(Boolean) as string[],
          error: ocrResult.error || "Kein lesbarer Text erkannt",
          message: scannedPdfMessage,
          quality,
        };
      }

      const parsed = parseByType(type, ocrResult.text);
      const hasData = Object.keys(parsed.data).length > 0;
      const warnings = [...ocrResult.warnings, ...(hasData ? [] : ["OCR hat Text erkannt, aber keine sicheren Falldaten. Bitte prüfen."])];

      return {
        type,
        fileName: file.name,
        status: hasData ? "Daten erkannt" : "Text erkannt",
        success: true,
        requiresOCR: false,
        ocrUsed: true,
        textLength: ocrResult.textLength,
        extractedTextLength: ocrResult.textLength,
        data: parsed.data,
        issues: parsed.issues,
        warnings,
        message: "OCR wurde verwendet. Bitte erkannte Werte prüfen.",
        quality,
      };
    }

    const parsed = parseByType(type, text);
    const hasData = Object.keys(parsed.data).length > 0;

    return {
      type,
      fileName: file.name,
      status: hasData ? "Daten erkannt" : "Text erkannt",
      success: true,
      requiresOCR: false,
      ocrUsed: false,
      textLength: text.length,
      extractedTextLength: text.length,
      data: parsed.data,
      issues: parsed.issues,
      message: hasData ? undefined : "Text wurde erkannt, aber keine sicheren Falldaten. Bitte prüfen.",
      quality,
    };
  } catch (error) {
    console.error(`Extraktions-API: PDF konnte nicht analysiert werden (${type}, ${file.name}).`, error);
    const message = error instanceof Error ? error.message : String(error);

    return {
      type,
      fileName: file.name,
      status: "Prüfung erforderlich",
      success: false,
      requiresOCR: false,
      textLength: 0,
      extractedTextLength: 0,
      data: {},
      issues: [{ field: type, message }],
      error: message,
      message,
    };
  }
}

function parseByType(type: ExtractionDocumentType, text: string) {
  if (type === "Datenblatt") return extractDatenblatt(text);
  if (type === "Mietvertrag") return extractMietvertrag(text);
  if (type === "Richtwert") return extractRichtwert(text);

  return { data: {}, issues: [] };
}

function mergeExtractedDocuments(documents: DocumentExtractionResult[]) {
  const merged: Partial<ExtractedData> = {};
  const datenblatt = documents.find((document) => document.type === "Datenblatt")?.data ?? {};
  const mietvertrag = documents.find((document) => document.type === "Mietvertrag")?.data ?? {};
  const richtwert = documents.find((document) => document.type === "Richtwert")?.data ?? {};

  mergeTenantAddress(merged, datenblatt, "overwrite");
  assignFields(merged, datenblatt, [
    "tenantName",
    "phone",
    "moveInDate",
    "leaseStart",
    "grossRent",
    "aktuelle_miete",
    "brutto_miete",
    "hauptmietzins",
    "fixedTerm",
    "opposingParty",
    "representation",
    "caseWorker",
    "equipment",
    "bathToiletSameRoom",
    "corridorKitchen",
    "noiseImpact",
    "intercom",
    "cellar",
  ]);

  mergeTenantAddress(merged, mietvertrag, "fill");
  assignFields(merged, mietvertrag, [
    "landlord",
    "landlordAddress",
    "landlordPostalCity",
    "landlordRepresentedBy",
    "birthDate",
    "leaseStart",
    "leaseEnd",
    "contractArea",
    "nutzflaeche_laut_vertrag",
    "fixedTerm",
    "deposit",
  ]);
  assignIfMissing(merged, "tenantName", mietvertrag.tenantName);
  assignIfMissing(merged, "grossRent", mietvertrag.grossRent);
  assignIfMissing(merged, "aktuelle_miete", mietvertrag.aktuelle_miete ?? mietvertrag.brutto_miete ?? mietvertrag.grossRent);
  assignIfMissing(merged, "brutto_miete", mietvertrag.brutto_miete ?? mietvertrag.grossRent);
  assignIfMissing(merged, "representation", mietvertrag.representation ?? mietvertrag.landlordRepresentedBy);

  mergeTenantAddress(merged, richtwert, "postalOnly");
  assignFields(merged, richtwert, [
    "category",
    "guidelineRentPerSqm",
    "measuredArea",
    "nutzflaeche_nachgemessen",
    "operatingCostPerSqm",
    "guidelineRentTotal",
    "netRent",
    "allowedGrossRent",
    "allowedGrossRentFixedTerm",
    "operatingCosts",
    "vat",
    "adjustments",
  ]);
  assignIfMissing(merged, "nutzflaeche_nachgemessen", richtwert.measuredArea);
  assignIfMissing(merged, "landlord", datenblatt.opposingParty);
  assignIfMissing(merged, "recipientName", merged.landlord || merged.opposingParty);
  assignIfMissing(merged, "recipientAddress", merged.landlordAddress);
  assignIfMissing(merged, "recipientPostalCity", merged.landlordPostalCity);

  if (merged.fixedTerm && richtwert.allowedGrossRentFixedTerm) {
    assignIfValue(merged, "allowedGrossRent", richtwert.allowedGrossRentFixedTerm);
  } else if (richtwert.allowedGrossRent) {
    assignIfValue(merged, "allowedGrossRent", richtwert.allowedGrossRent);
  }

  return merged;
}

function assignFields(target: Partial<ExtractedData>, source: Partial<ExtractedData>, fields: Array<keyof ExtractedData>) {
  for (const field of fields) {
    assignIfValue(target, field, source[field]);
  }
}

function assignIfValue<K extends keyof ExtractedData>(target: Partial<ExtractedData>, field: K, value: ExtractedData[K] | undefined) {
  if (value === undefined || value === "" || value === null) return;
  target[field] = value;
}

function assignIfMissing<K extends keyof ExtractedData>(target: Partial<ExtractedData>, field: K, value: ExtractedData[K] | undefined) {
  if (target[field] !== undefined && target[field] !== "" && target[field] !== null) return;
  assignIfValue(target, field, value);
}

function mergeTenantAddress(target: Partial<ExtractedData>, source: Partial<ExtractedData>, mode: "overwrite" | "fill" | "postalOnly") {
  const sourceStreet = source.tenantStreet;
  const canUseFullAddress = isUsableAddress(source.tenantFullAddress || source.tenantAddress || sourceStreet || "");

  if (mode === "postalOnly") {
    if (!canUseFullAddress) return;
    if (sourceStreet && target.tenantStreet && !addressesLookRelated(target.tenantStreet, sourceStreet)) return;

    assignIfMissing(target, "tenantPostalCode", source.tenantPostalCode);
    assignIfMissing(target, "tenantCity", source.tenantCity);
    rebuildTenantFullAddress(target);
    return;
  }

  if (!canUseFullAddress) return;

  const fields: Array<keyof ExtractedData> = ["tenantAddress", "tenantStreet", "tenantDoor", "tenantPostalCode", "tenantCity", "tenantFullAddress"];
  for (const field of fields) {
    if (mode === "overwrite") {
      assignIfValue(target, field, source[field]);
    } else {
      assignIfMissing(target, field, source[field]);
    }
  }

  rebuildTenantFullAddress(target);
}

function rebuildTenantFullAddress(target: Partial<ExtractedData>) {
  if (!target.tenantStreet) return;

  const streetDoor = [target.tenantStreet, target.tenantDoor].filter(Boolean).join(" ");
  const postalCity = [target.tenantPostalCode, target.tenantCity].filter(Boolean).join(" ");

  target.tenantFullAddress = postalCity ? `${streetDoor}, ${postalCity}` : streetDoor;
  target.tenantAddress = target.tenantFullAddress;
}

function addressesLookRelated(left: string, right: string) {
  const normalizedLeft = normalizeAddressForCompare(left);
  const normalizedRight = normalizeAddressForCompare(right);

  return Boolean(normalizedLeft && normalizedRight && (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)));
}

function normalizeAddressForCompare(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/\btür\s*\w+/g, "")
    .replace(/[^a-z0-9äöü]+/g, " ")
    .trim();
}

function isUsableAddress(value: string) {
  return Boolean(value) && !/^(Erreichbarkeit|Station|Linien|Seite|Bitte beachten Sie|Informationen zum Richtwertmietzins|Die Servicestellen der Stadt Wien)\b/i.test(value.trim());
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value;
}

function toDocumentsByKey(documents: DocumentExtractionResult[]) {
  return Object.fromEntries(documents.map((document) => [documentKey(document.type), document])) as Partial<Record<ExtractionDocumentKey, DocumentExtractionResult>>;
}

function documentKey(type: ExtractionDocumentType): ExtractionDocumentKey {
  if (type === "Datenblatt") return "datenblatt";
  if (type === "Mietvertrag") return "mietvertrag";
  if (type === "Richtwert") return "richtwert";
  return "gutachten";
}

function createFailureResponse(error: string) {
  return {
    success: false,
    partial: false,
    error,
    documents: {},
    documentResults: [],
    data: {},
    mergedData: {},
    issues: [],
    warnings: [error],
  };
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function methodNotAllowed() {
  return json(createFailureResponse("Diese API unterstützt nur PDF-Uploads per POST."), 405);
}
