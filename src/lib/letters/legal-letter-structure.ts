import type { CalculationResult, ExtractedData, LetterAttachment, SavedCaseDocument } from "@/types/case";
import { defaultCompanyProfile } from "@/lib/company-profile";

export type LegalLetterSource = {
  tenant?: string;
  address?: string;
  extracted?: Partial<ExtractedData>;
  calculation?: Partial<CalculationResult>;
  documents?: SavedCaseDocument[];
  letterAttachments?: LetterAttachment[];
  pendingExtractedChanges?: Array<{ changed: boolean }>;
  calculationReportGeneratedAt?: string;
  calculationReportVersion?: string;
  calculationReport?: unknown;
  calculationReportDocxGeneratedAt?: string;
  calculationReportPdfGeneratedAt?: string;
};

export type LegalLetterSections = {
  subjectLine: string;
  claimSummary: string;
  settlementProposal: string;
  futureRentSection: string;
  attachmentList: string;
  legalReservationText: string;
  introduction: string;
  calculationBasis: string;
};

export function buildLegalLetterSections(caseRecord: LegalLetterSource): LegalLetterSections {
  return {
    subjectLine: buildSubjectLine(caseRecord),
    claimSummary: buildClaimSummary(caseRecord),
    settlementProposal: buildSettlementProposal(caseRecord),
    futureRentSection: buildFutureRentSection(caseRecord),
    attachmentList: buildAttachmentList(caseRecord),
    legalReservationText: buildLegalReservationText(caseRecord),
    introduction: buildIntroduction(caseRecord),
    calculationBasis: buildCalculationBasis(caseRecord),
  };
}

export function buildSubjectLine(caseRecord: LegalLetterSource) {
  const tenant = clean(caseRecord.tenant || caseRecord.extracted?.tenantName);
  const address = clean(caseRecord.address || caseRecord.extracted?.tenantFullAddress || caseRecord.extracted?.tenantAddress);
  const details = [address, tenant].filter(Boolean).join(", ");
  return `Vergleichsangebot betreffend das Mietverhältnis${details ? ` ${details}` : ""}`;
}

export function buildClaimSummary(caseRecord: LegalLetterSource) {
  const calculation = caseRecord.calculation ?? {};
  const period = buildPeriodText(calculation);
  const monthly = money(calculation.monatliche_ueberzahlung ?? calculation.monthlyExcess);
  const total = money(calculation.gesamte_ueberzahlung ?? calculation.totalExcess);
  const refunded = money(calculation.bereits_rueckerstattet ?? calculation.paidDeductions);
  const open = money(calculation.offene_forderung ?? calculation.settlementAmount);

  return [
    `Für den geprüften Rückforderungszeitraum${period ? ` ${period}` : ""} ergibt sich nach derzeitiger Berechnung eine monatliche Überzahlung von ${monthly || "noch nicht abschließend berechnet"}.`,
    `Die gesamte Überzahlung beträgt ${total || "noch nicht abschließend berechnet"}. Bereits berücksichtigte Rückerstattungen oder Abschlagszahlungen betragen ${refunded || "EUR 0,00"}.`,
    `Daraus ergibt sich derzeit eine offene Forderung von ${open || "noch nicht abschließend berechnet"}.`,
  ].join("\n");
}

export function buildSettlementProposal(caseRecord: LegalLetterSource) {
  const calculation = caseRecord.calculation ?? {};
  const quote = percent(calculation.vergleichsquote);
  const reduction = percent(calculation.settlementReductionPercent);
  const settlement = money(calculation.vergleichsbetrag ?? calculation.settlementAmount);
  const iban = defaultCompanyProfile.iban;
  const quoteText = quote ? `auf Basis einer Vergleichsquote von ${quote}` : reduction ? `unter Berücksichtigung einer Vergleichsreduktion von ${reduction}` : "zur einvernehmlichen Bereinigung";
  const payment = iban ? ` Die Zahlung kann auf das im Schreiben angeführte Konto erfolgen.` : "";

  return `Zur außergerichtlichen und einvernehmlichen Bereinigung schlagen wir ${quoteText} einen Vergleichsbetrag von ${settlement || "noch festzulegen"} vor. Wir ersuchen um Rückmeldung beziehungsweise Zahlung binnen der angeführten Frist.${payment}`;
}

export function buildFutureRentSection(caseRecord: LegalLetterSource) {
  const calculation = caseRecord.calculation ?? {};
  const futureRent = money(calculation.zukuenftiger_mietzins ?? calculation.futureAcceptedRent);
  const savings = money(calculation.zukuenftige_monatliche_ersparnis);

  if (!futureRent && !savings) {
    return "Für die künftige Vorschreibung ist der zulässige laufende Mietzins nach weiterer Prüfung festzulegen.";
  }

  return `Für die zukünftige laufende Vorschreibung wird nach derzeitiger Berechnung ein Gesamtmietzins von ${futureRent || "noch festzulegen"} angesetzt.${savings ? ` Die monatliche Entlastung beträgt rechnerisch ${savings}.` : ""}`;
}

export function buildAttachmentList(caseRecord: LegalLetterSource) {
  const attachments = buildLetterAttachments(caseRecord).filter((attachment) => attachment.includedInLetter !== false);
  return attachments.length > 0
    ? attachments.map((item, index) => `${index + 1}. ${item.label}${item.fileName ? ` (${item.fileName})` : ""}`).join("\n")
    : "1. Anlagen werden nachgereicht beziehungsweise gesondert übermittelt.";
}

export function buildCalculationReportNotice(caseRecord: LegalLetterSource) {
  const hasReport = Boolean(caseRecord.calculationReport || caseRecord.calculationReportGeneratedAt || caseRecord.calculationReportDocxGeneratedAt || caseRecord.calculationReportPdfGeneratedAt);
  return hasReport ? "Die Berechnungsaufstellung ist diesem Schreiben beigefügt." : "";
}

export function buildLetterAttachments(caseRecord: LegalLetterSource): LetterAttachment[] {
  if (caseRecord.letterAttachments?.length) return caseRecord.letterAttachments;

  const attachments: LetterAttachment[] = [];
  const documents = caseRecord.documents ?? [];

  for (const document of documents) {
    const attachment = documentToAttachment(document);
    if (attachment) attachments.push(attachment);
  }

  if (caseRecord.calculationReport || caseRecord.calculationReportGeneratedAt || caseRecord.calculationReportDocxGeneratedAt || caseRecord.calculationReportPdfGeneratedAt) {
    attachments.push({
      id: "attachment-calculation-report",
      type: "berechnungsbericht",
      label: "Berechnungsbericht",
      fileName: "Berechnungsbericht",
      includedInLetter: true,
      generatedAt: caseRecord.calculationReportPdfGeneratedAt ?? caseRecord.calculationReportDocxGeneratedAt ?? caseRecord.calculationReportGeneratedAt,
      metadata: { reportVersion: caseRecord.calculationReportVersion },
    });
  }

  return dedupeAttachments(attachments);
}

export function buildLegalReservationText(caseRecord: LegalLetterSource) {
  const calculationWarnings = caseRecord.calculation?.calculationWarnings ?? [];
  const pendingCount = (caseRecord.pendingExtractedChanges ?? []).filter((change) => change.changed).length;
  const ocrWarnings = (caseRecord.documents ?? []).flatMap((document) => document.extractionWarnings ?? []).filter((warning) => /ocr/i.test(warning));
  const overrides = caseRecord.calculation?.overriddenFields ?? [];
  const presentTypes = new Set((caseRecord.documents ?? []).map((document) => document.type));
  const missingRequired = ["Datenblatt", "Mietvertrag", "Richtwert"].filter((type) => !presentTypes.has(type as SavedCaseDocument["type"]));
  const notes: string[] = [
    "Dieses Schreiben erfolgt auf Grundlage der derzeit vorliegenden Unterlagen und Berechnungsdaten.",
    "Alle Beträge und Annahmen stehen vorbehaltlich weiterer Prüfung und ergänzender Unterlagen.",
  ];

  if (calculationWarnings.length > 0) notes.push(`Es bestehen Berechnungshinweise: ${calculationWarnings.join("; ")}.`);
  if (ocrWarnings.length > 0) notes.push("Teile der Dokumentenauswertung beruhen auf OCR-Erkennung; die erkannten Werte sind daher besonders zu prüfen.");
  if (pendingCount > 0) notes.push(`Es bestehen ${pendingCount} ungeprüfte erkannte Änderung(en), die vor finaler Verwendung zu kontrollieren sind.`);
  if (overrides.length > 0) notes.push(`Folgende Werte wurden manuell angepasst: ${overrides.join(", ")}.`);
  if (missingRequired.length > 0) notes.push("Bestimmte Unterlagen lagen zum Zeitpunkt der Berechnung nicht vor.");

  return notes.join("\n");
}

function documentToAttachment(document: SavedCaseDocument): LetterAttachment | undefined {
  const typeMap: Record<SavedCaseDocument["type"], LetterAttachment["type"]> = {
    Datenblatt: "datenblatt",
    Mietvertrag: "mietvertrag",
    Richtwert: "richtwert",
    Gutachten: "gutachten",
    "Weitere Dokumente": "sonstiges",
  };
  const labelMap: Record<SavedCaseDocument["type"], string> = {
    Datenblatt: "Datenblatt",
    Mietvertrag: "Mietvertrag",
    Richtwert: "Richtwertberechnung",
    Gutachten: "Gutachten",
    "Weitere Dokumente": "Weiteres Dokument",
  };

  return {
    id: `attachment-${document.id}`,
    type: typeMap[document.type],
    label: labelMap[document.type],
    fileName: document.fileName,
    includedInLetter: true,
    generatedAt: document.extractedAt ?? document.uploadedAt,
    sourceDocumentId: document.id,
    metadata: { documentType: document.type, extractionStatus: document.extractionStatus },
  };
}

function dedupeAttachments(attachments: LetterAttachment[]) {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = `${attachment.type}:${attachment.sourceDocumentId ?? attachment.fileName ?? attachment.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildIntroduction(caseRecord: LegalLetterSource) {
  const extracted = caseRecord.extracted ?? {};
  const tenant = clean(caseRecord.tenant || extracted.tenantName) || "der/die Mieter/in";
  const address = clean(caseRecord.address || extracted.tenantFullAddress || extracted.tenantAddress) || "die gegenständliche Wohnung";
  const start = date(extracted.leaseStart || extracted.moveInDate);

  return `Wir beziehen uns auf das Mietverhältnis von ${tenant} betreffend ${address}${start ? ` mit Mietbeginn ${start}` : ""}. Auf Grundlage der vorliegenden Unterlagen wurde eine rechnerische Überprüfung der Mietzinsvorschreibung vorbereitet.`;
}

function buildCalculationBasis(caseRecord: LegalLetterSource) {
  const calculation = caseRecord.calculation ?? {};
  const extracted = caseRecord.extracted ?? {};
  const current = money(calculation.currentGrossRent ?? calculation.aktuelle_miete);
  const allowed = money(calculation.allowedGrossRent);
  const monthly = money(calculation.monatliche_ueberzahlung ?? calculation.monthlyExcess);
  const area = areaText(calculation.nutzflaeche ?? calculation.measuredArea ?? extracted.measuredArea ?? extracted.nutzflaeche_nachgemessen);
  const guideline = money(calculation.richtwert_pro_m2 ?? extracted.guidelineRentPerSqm);
  const fixed = calculation.fixedTerm ?? extracted.fixedTerm;

  return [
    `Aktuelle Bruttomiete: ${current || "nicht angegeben"}`,
    `Erlaubte Bruttomiete nach derzeitiger Berechnung: ${allowed || "nicht angegeben"}`,
    `Monatliche Überzahlung: ${monthly || "nicht angegeben"}`,
    `Verwendete Nutzfläche: ${area || "nicht angegeben"}`,
    `Richtwert: ${guideline || "nicht angegeben"}`,
    `Befristung: ${fixed ? "ja" : "nein beziehungsweise nicht gesondert festgestellt"}`,
  ].join("\n");
}

function buildPeriodText(calculation: Partial<CalculationResult>) {
  const start = date(calculation.rueckforderungszeitraum_start || calculation.startDate);
  const end = date(calculation.rueckforderungszeitraum_ende || calculation.endDate);
  const months = calculation.rueckforderungszeitraum_monate ?? calculation.months;
  const dates = [start, end].filter(Boolean).join(" bis ");
  if (dates && months) return `(${dates}, ${months} Monate)`;
  if (dates) return `(${dates})`;
  if (months) return `(${months} Monate)`;
  return "";
}

function money(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric)) return "";
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(numeric);
}

function percent(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric)) return "";
  return `${String(numeric).replace(".", ",")} %`;
}

function areaText(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric)) return "";
  return `${String(numeric).replace(".", ",")} m²`;
}

function date(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("de-AT").format(parsed);
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}
