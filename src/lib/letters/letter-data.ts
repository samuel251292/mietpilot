import { defaultCompanyProfile } from "@/lib/company-profile";
import { buildCalculationReportNotice, buildLegalLetterSections, type LegalLetterSource } from "@/lib/letters/legal-letter-structure";
import { deriveRecipientMapping, sanitizeExtractedData } from "@/lib/recipient";
import type { CalculationResult, CaseRecord, SavedCaseRecord } from "@/types/case";

export type LetterTemplateData = Record<string, string>;

export type LetterPlaceholderCatalogEntry = {
  key: string;
  placeholder: `{{${string}}}`;
  label: string;
  group: "Parteien" | "Mietverhältnis" | "Berechnung" | "Abrechnung" | "Quellen/Warnungen" | "Schreiben-Struktur" | "Anlagen" | "Unternehmen";
  required?: boolean;
};

type LetterWizardData = {
  tenantName?: string;
  address?: string;
  tenantStreet?: string;
  tenantDoor?: string;
  tenantPostalCode?: string;
  tenantCity?: string;
  tenantFullAddress?: string;
  recipientName?: string;
  recipientAddress?: string;
  recipientPostalCity?: string;
  opposingParty?: string;
  representation?: string;
  caseWorker?: string;
  landlordName?: string;
  landlordAddress?: string;
  landlordPostalCity?: string;
  category?: string;
  contractArea?: number;
  area?: number;
  measuredArea?: number;
  nutzflaeche_laut_vertrag?: number;
  nutzflaeche_nachgemessen?: number;
  leaseStart?: string;
  fixedTerm?: boolean;
  guidelineRentPerSqm?: number;
  manualOverrides?: Record<string, unknown>;
  overriddenFields?: string[];
  pendingExtractedChanges?: Array<{ changed: boolean }>;
};

const placeholderCatalog: LetterPlaceholderCatalogEntry[] = [
  catalog("datum", "Datum", "Unternehmen"),
  catalog("firma_name", "Firma", "Unternehmen"),
  catalog("empfaenger_name", "Empfänger", "Parteien", true),
  catalog("empfaenger_adresse", "Empfänger-Adresse", "Parteien", true),
  catalog("empfaenger_plz_ort", "Empfänger PLZ/Ort", "Parteien", true),
  catalog("antragsgegner", "Antragsgegner", "Parteien", true),
  catalog("vertretung", "Vertretung", "Parteien", true),
  catalog("ansprechpartner", "Ansprechpartner", "Unternehmen"),
  catalog("vermieter_name", "Vermieter", "Parteien", true),
  catalog("vermieter_adresse", "Vermieter-Adresse", "Parteien", true),
  catalog("vermieter_plz_ort", "Vermieter PLZ/Ort", "Parteien", true),
  catalog("mieter_name", "Mieter", "Parteien", true),
  catalog("mieter_strasse", "Mieter-Straße", "Parteien", true),
  catalog("mieter_tuer", "Mieter-Tür", "Parteien", true),
  catalog("mieter_plz", "Mieter-PLZ", "Parteien", true),
  catalog("mieter_ort", "Mieter-Ort", "Parteien", true),
  catalog("mieter_adresse_vollstaendig", "Mieter-Adresse vollständig", "Parteien", true),
  catalog("wohnungsadresse", "Wohnungsadresse", "Mietverhältnis", true),
  catalog("kategorie", "Kategorie", "Mietverhältnis", true),
  catalog("nutzflaeche", "Nutzfläche", "Mietverhältnis", true),
  catalog("mietbeginn", "Mietbeginn", "Mietverhältnis", true),
  catalog("aktuelle_miete", "Aktuelle Miete", "Berechnung", true),
  catalog("erlaubte_miete", "Erlaubte Miete", "Berechnung", true),
  catalog("monatliche_ueberschreitung", "Monatliche Überschreitung", "Berechnung", true),
  catalog("zeitraum_monate", "Zeitraum Monate", "Berechnung"),
  catalog("gesamtueberschreitung", "Gesamtüberschreitung", "Berechnung", true),
  catalog("vergleichsreduktion_prozent", "Vergleichsreduktion Prozent", "Berechnung", true),
  catalog("vergleichsbetrag", "Vergleichsbetrag", "Berechnung", true),
  catalog("zukuenftiger_mietzins", "Zukünftiger Mietzins", "Berechnung", true),
  catalog("frist_tage", "Frist Tage", "Unternehmen", true),
  catalog("bank_name", "Bank", "Unternehmen"),
  catalog("iban", "IBAN", "Unternehmen", true),
  catalog("bic", "BIC", "Unternehmen"),
  catalog("geschaeftsfuehrer", "Geschäftsführer", "Unternehmen", true),
  catalog("offene_forderung", "Offene Forderung", "Abrechnung"),
  catalog("bereits_rueckerstattet", "Bereits rückerstattet", "Abrechnung"),
  catalog("gesamtueberzahlung", "Gesamtüberzahlung", "Abrechnung"),
  catalog("monatliche_ueberzahlung", "Monatliche Überzahlung", "Abrechnung"),
  catalog("hauptmietzins", "Hauptmietzins", "Abrechnung"),
  catalog("betriebskosten", "Betriebskosten", "Abrechnung"),
  catalog("umsatzsteuer", "Umsatzsteuer", "Abrechnung"),
  catalog("sonstige_zuschlaege", "Sonstige Zuschläge", "Abrechnung"),
  catalog("gesamtmiete_brutto", "Gesamtmiete brutto", "Abrechnung"),
  catalog("pauschalmietzins", "Pauschalmietzins", "Abrechnung"),
  catalog("pauschalmiete", "Pauschalmiete", "Abrechnung"),
  catalog("vergleichsquote", "Vergleichsquote", "Abrechnung"),
  catalog("zukunftsreduktion_prozent", "Zukunftsreduktion Prozent", "Abrechnung"),
  catalog("zukuenftige_monatliche_ersparnis", "Zukünftige monatliche Ersparnis", "Abrechnung"),
  catalog("nutzflaeche_laut_vertrag", "Nutzfläche laut Vertrag", "Mietverhältnis"),
  catalog("nutzflaeche_nachgemessen", "Nutzfläche nachgemessen", "Mietverhältnis"),
  catalog("verwendete_nutzflaeche", "Verwendete Nutzfläche", "Mietverhältnis"),
  catalog("richtwert_pro_m2", "Richtwert pro m²", "Mietverhältnis"),
  catalog("befristungsabschlag_prozent", "Befristungsabschlag Prozent", "Mietverhältnis"),
  catalog("aktuelle_miete_quelle", "Quelle aktuelle Miete", "Quellen/Warnungen"),
  catalog("erlaubte_miete_quelle", "Quelle erlaubte Miete", "Quellen/Warnungen"),
  catalog("nutzflaeche_quelle", "Quelle Nutzfläche", "Quellen/Warnungen"),
  catalog("zeitraum_quelle", "Quelle Zeitraum", "Quellen/Warnungen"),
  catalog("manuelle_anpassungen", "Manuelle Anpassungen", "Quellen/Warnungen"),
  catalog("berechnungs_warnungen", "Berechnungswarnungen", "Quellen/Warnungen"),
  catalog("ocr_hinweise", "OCR-Hinweise", "Quellen/Warnungen"),
  catalog("ungepruefte_aenderungen", "Ungeprüfte Änderungen", "Quellen/Warnungen"),
  catalog("berechnungsbericht_status", "Berechnungsbericht Status", "Quellen/Warnungen"),
  catalog("betreff", "Betreff", "Schreiben-Struktur"),
  catalog("einleitung_text", "Einleitung", "Schreiben-Struktur"),
  catalog("berechnungsgrundlage_text", "Berechnungsgrundlage", "Schreiben-Struktur"),
  catalog("forderungsaufstellung_text", "Forderungsaufstellung", "Schreiben-Struktur"),
  catalog("vergleichsvorschlag_text", "Vergleichsvorschlag", "Schreiben-Struktur"),
  catalog("zukuenftiger_mietzins_text", "Zukünftiger Mietzins Text", "Schreiben-Struktur"),
  catalog("anlagenliste", "Anlagenliste", "Anlagen"),
  catalog("berechnungsbericht_hinweis", "Berechnungsbericht Hinweis", "Anlagen"),
  catalog("pruefungsvorbehalt_text", "Prüfungsvorbehalt", "Schreiben-Struktur"),
];

export function buildLetterTemplateData(caseRecord: CaseRecord | SavedCaseRecord): LetterTemplateData {
  const extracted = sanitizeExtractedData(caseRecord.extracted);
  const recipient = deriveRecipientMapping(extracted);
  const calculation = caseRecord.calculation;
  const documents = "documents" in caseRecord ? caseRecord.documents : [];
  const pendingChanges = "pendingExtractedChanges" in caseRecord ? caseRecord.pendingExtractedChanges ?? [] : [];

  const legalSource: LegalLetterSource = {
    tenant: caseRecord.tenant,
    address: caseRecord.address,
    extracted,
    calculation,
    documents,
    letterAttachments: "letterAttachments" in caseRecord ? caseRecord.letterAttachments ?? [] : [],
    pendingExtractedChanges: pendingChanges,
    calculationReport: caseRecord.calculationReport,
    calculationReportGeneratedAt: caseRecord.calculationReportGeneratedAt,
    calculationReportVersion: caseRecord.calculationReportVersion,
    calculationReportDocxGeneratedAt: "calculationReportDocxGeneratedAt" in caseRecord ? caseRecord.calculationReportDocxGeneratedAt : undefined,
    calculationReportPdfGeneratedAt: "calculationReportPdfGeneratedAt" in caseRecord ? caseRecord.calculationReportPdfGeneratedAt : undefined,
  };

  return createTemplateData({
    common: {
      recipientName: recipient.recipientName,
      recipientAddress: recipient.recipientAddress,
      recipientPostalCity: recipient.recipientPostalCity,
      opposingParty: extracted.opposingParty,
      representation: extracted.representation,
      caseWorker: extracted.caseWorker,
      landlordName: recipient.landlordName,
      landlordAddress: recipient.landlordAddress,
      landlordPostalCity: recipient.landlordPostalCity,
      tenantName: caseRecord.tenant,
      tenantStreet: extracted.tenantStreet,
      tenantDoor: extracted.tenantDoor,
      tenantPostalCode: extracted.tenantPostalCode,
      tenantCity: extracted.tenantCity,
      tenantFullAddress: extracted.tenantFullAddress,
      address: caseRecord.address,
      category: extracted.category,
      contractArea: extracted.nutzflaeche_laut_vertrag || extracted.contractArea,
      measuredArea: extracted.nutzflaeche_nachgemessen || extracted.measuredArea,
      leaseStart: extracted.leaseStart || extracted.moveInDate,
      fixedTerm: extracted.fixedTerm,
      guidelineRentPerSqm: extracted.guidelineRentPerSqm,
      pendingExtractedChanges: pendingChanges,
    },
    calculation,
    ocrWarnings: documents.flatMap((document) => document.extractionWarnings ?? []).filter((warning) => /ocr/i.test(warning)),
    reportStatus: caseRecord.calculationReportGeneratedAt ? `Erstellt am ${formatLetterDate(caseRecord.calculationReportGeneratedAt)}` : "Nicht erstellt",
    legalSections: buildLegalLetterSections(legalSource),
    reportNotice: buildCalculationReportNotice(legalSource),
  });
}

export function buildLetterTemplateDataFromWizardData(wizardData: LetterWizardData, calculationResult?: Partial<CalculationResult>): LetterTemplateData {
  const legalSource: LegalLetterSource = {
    tenant: wizardData.tenantName,
    address: wizardData.address,
    extracted: {
      tenantName: wizardData.tenantName,
      tenantStreet: wizardData.tenantStreet,
      tenantDoor: wizardData.tenantDoor,
      tenantPostalCode: wizardData.tenantPostalCode,
      tenantCity: wizardData.tenantCity,
      tenantFullAddress: wizardData.tenantFullAddress,
      tenantAddress: wizardData.tenantFullAddress,
      category: wizardData.category,
      leaseStart: wizardData.leaseStart,
      fixedTerm: wizardData.fixedTerm,
      measuredArea: wizardData.area,
      nutzflaeche_nachgemessen: wizardData.nutzflaeche_nachgemessen,
      nutzflaeche_laut_vertrag: wizardData.nutzflaeche_laut_vertrag,
      guidelineRentPerSqm: wizardData.guidelineRentPerSqm,
    },
    calculation: calculationResult,
    pendingExtractedChanges: wizardData.pendingExtractedChanges,
  };

  return createTemplateData({
    common: {
      recipientName: wizardData.recipientName,
      recipientAddress: wizardData.recipientAddress,
      recipientPostalCity: wizardData.recipientPostalCity,
      opposingParty: wizardData.opposingParty,
      representation: wizardData.representation,
      caseWorker: wizardData.caseWorker,
      landlordName: wizardData.landlordName,
      landlordAddress: wizardData.landlordAddress,
      landlordPostalCity: wizardData.landlordPostalCity,
      tenantName: wizardData.tenantName,
      tenantStreet: wizardData.tenantStreet,
      tenantDoor: wizardData.tenantDoor,
      tenantPostalCode: wizardData.tenantPostalCode,
      tenantCity: wizardData.tenantCity,
      tenantFullAddress: wizardData.tenantFullAddress,
      address: wizardData.address,
      category: wizardData.category,
      contractArea: wizardData.nutzflaeche_laut_vertrag || wizardData.contractArea,
      measuredArea: wizardData.nutzflaeche_nachgemessen || wizardData.area,
      leaseStart: wizardData.leaseStart,
      fixedTerm: wizardData.fixedTerm,
      guidelineRentPerSqm: wizardData.guidelineRentPerSqm,
      pendingExtractedChanges: wizardData.pendingExtractedChanges,
    },
    calculation: calculationResult,
    reportStatus: "Noch nicht gespeichert",
    legalSections: buildLegalLetterSections(legalSource),
    reportNotice: "",
  });
}

export function normalizeLetterTemplateValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "number") return Number.isFinite(value) ? String(value).replace(".", ",") : "";
  if (Array.isArray(value)) return value.map(normalizeLetterTemplateValue).filter(Boolean).join("\n");
  return String(value).trim();
}

export function formatLetterCurrency(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric)) return "";
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(numeric);
}

export function formatLetterDate(value: unknown): string {
  const raw = normalizeLetterTemplateValue(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("de-AT").format(date);
}

export function getLetterPlaceholderCatalog(): LetterPlaceholderCatalogEntry[] {
  return [...placeholderCatalog];
}

export function toDocxTemplateData(values: LetterTemplateData): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key.replace(/^\{\{|\}\}$/g, ""), value]));
}

function createTemplateData({
  common,
  calculation,
  ocrWarnings = [],
  reportStatus = "",
  legalSections,
  reportNotice = "",
}: {
  common: LetterWizardData;
  calculation?: Partial<CalculationResult>;
  ocrWarnings?: string[];
  reportStatus?: string;
  legalSections?: ReturnType<typeof buildLegalLetterSections>;
  reportNotice?: string;
}) {
  const basis = calculation?.calculationBasis ?? {};
  const dataByKey: Record<string, string> = {
    datum: formatLetterDate(new Date().toISOString()),
    firma_name: defaultCompanyProfile.companyName,
    empfaenger_name: common.recipientName ?? "",
    empfaenger_adresse: common.recipientAddress ?? "",
    empfaenger_plz_ort: common.recipientPostalCity ?? "",
    antragsgegner: common.opposingParty ?? "",
    vertretung: common.representation ?? "",
    ansprechpartner: common.caseWorker ?? "",
    vermieter_name: common.landlordName ?? "",
    vermieter_adresse: common.landlordAddress ?? "",
    vermieter_plz_ort: common.landlordPostalCity ?? "",
    mieter_name: common.tenantName ?? "",
    mieter_strasse: common.tenantStreet ?? "",
    mieter_tuer: common.tenantDoor ?? "",
    mieter_plz: common.tenantPostalCode ?? "",
    mieter_ort: common.tenantCity ?? "",
    mieter_adresse_vollstaendig: common.tenantFullAddress ?? "",
    wohnungsadresse: common.address ?? "",
    kategorie: common.category ?? "",
    nutzflaeche: normalizeLetterTemplateValue(calculation?.nutzflaeche ?? common.measuredArea ?? common.contractArea),
    mietbeginn: formatLetterDate(common.leaseStart),
    aktuelle_miete: formatLetterCurrency(calculation?.currentGrossRent ?? calculation?.aktuelle_miete),
    erlaubte_miete: formatLetterCurrency(calculation?.allowedGrossRent),
    monatliche_ueberschreitung: formatLetterCurrency(calculation?.monthlyExcess ?? calculation?.monatliche_ueberzahlung),
    zeitraum_monate: normalizeLetterTemplateValue(calculation?.months ?? calculation?.rueckforderungszeitraum_monate),
    gesamtueberschreitung: formatLetterCurrency(calculation?.totalExcess ?? calculation?.gesamte_ueberzahlung),
    vergleichsreduktion_prozent: normalizeLetterTemplateValue(calculation?.settlementReductionPercent),
    vergleichsbetrag: formatLetterCurrency(calculation?.settlementAmount ?? calculation?.vergleichsbetrag),
    zukuenftiger_mietzins: formatLetterCurrency(calculation?.futureAcceptedRent ?? calculation?.zukuenftiger_mietzins),
    frist_tage: "14",
    bank_name: defaultCompanyProfile.bankName,
    iban: defaultCompanyProfile.iban,
    bic: defaultCompanyProfile.bic,
    geschaeftsfuehrer: defaultCompanyProfile.managingDirector,
    offene_forderung: formatLetterCurrency(calculation?.offene_forderung),
    bereits_rueckerstattet: formatLetterCurrency(calculation?.bereits_rueckerstattet ?? calculation?.paidDeductions),
    gesamtueberzahlung: formatLetterCurrency(calculation?.gesamte_ueberzahlung ?? calculation?.totalExcess),
    monatliche_ueberzahlung: formatLetterCurrency(calculation?.monatliche_ueberzahlung ?? calculation?.monthlyExcess),
    hauptmietzins: formatLetterCurrency(calculation?.hauptmietzins),
    betriebskosten: formatLetterCurrency(calculation?.betriebskosten),
    umsatzsteuer: formatLetterCurrency(calculation?.umsatzsteuer),
    sonstige_zuschlaege: formatLetterCurrency(calculation?.sonstige_zuschlaege),
    gesamtmiete_brutto: formatLetterCurrency(calculation?.gesamtmiete_brutto ?? calculation?.currentGrossRent),
    pauschalmietzins: formatLetterCurrency(calculation?.pauschalmietzins),
    pauschalmiete: normalizeLetterTemplateValue(calculation?.pauschalmiete),
    vergleichsquote: normalizeLetterTemplateValue(calculation?.vergleichsquote),
    zukunftsreduktion_prozent: normalizeLetterTemplateValue(calculation?.zukunftsreduktion_prozent),
    zukuenftige_monatliche_ersparnis: formatLetterCurrency(calculation?.zukuenftige_monatliche_ersparnis),
    nutzflaeche_laut_vertrag: normalizeLetterTemplateValue(calculation?.contractArea ?? common.contractArea),
    nutzflaeche_nachgemessen: normalizeLetterTemplateValue(calculation?.measuredArea ?? common.measuredArea),
    verwendete_nutzflaeche: normalizeLetterTemplateValue(calculation?.nutzflaeche ?? common.measuredArea ?? common.contractArea),
    richtwert_pro_m2: formatLetterCurrency(calculation?.richtwert_pro_m2 ?? common.guidelineRentPerSqm),
    befristungsabschlag_prozent: normalizeLetterTemplateValue(calculation?.befristungsabschlag_prozent ?? (common.fixedTerm ? 25 : 0)),
    aktuelle_miete_quelle: basisLabel(basis, "currentRent", calculation?.currentRentSource),
    erlaubte_miete_quelle: basisLabel(basis, "allowedRent", calculation?.allowedRentSource),
    nutzflaeche_quelle: basisLabel(basis, "area", calculation?.areaSource),
    zeitraum_quelle: basisLabel(basis, "period", calculation?.periodSource),
    manuelle_anpassungen: manualAdjustmentText(calculation?.overriddenFields),
    berechnungs_warnungen: normalizeLetterTemplateValue(calculation?.calculationWarnings),
    ocr_hinweise: normalizeLetterTemplateValue(ocrWarnings),
    ungepruefte_aenderungen: pendingChangeText(common.pendingExtractedChanges),
    berechnungsbericht_status: reportStatus,
    betreff: legalSections?.subjectLine ?? "",
    einleitung_text: legalSections?.introduction ?? "",
    berechnungsgrundlage_text: legalSections?.calculationBasis ?? "",
    forderungsaufstellung_text: legalSections?.claimSummary ?? "",
    vergleichsvorschlag_text: legalSections?.settlementProposal ?? "",
    zukuenftiger_mietzins_text: legalSections?.futureRentSection ?? "",
    anlagenliste: legalSections?.attachmentList ?? "",
    berechnungsbericht_hinweis: reportNotice,
    pruefungsvorbehalt_text: legalSections?.legalReservationText ?? "",
  };

  return Object.fromEntries(placeholderCatalog.map((entry) => [entry.placeholder, dataByKey[entry.key] ?? ""]));
}

function catalog(key: string, label: string, group: LetterPlaceholderCatalogEntry["group"], required = false): LetterPlaceholderCatalogEntry {
  return { key, placeholder: `{{${key}}}`, label, group, required };
}

function basisLabel(basis: Record<string, unknown>, key: string, fallback?: string) {
  const value = basis[key];
  if (value && typeof value === "object" && "label" in value && typeof value.label === "string") return value.label;
  return fallback ?? "";
}

function manualAdjustmentText(fields?: string[]) {
  const uniqueFields = Array.from(new Set(fields ?? [])).filter(Boolean);
  return uniqueFields.length > 0 ? uniqueFields.join(", ") : "";
}

function pendingChangeText(changes?: Array<{ changed: boolean }>) {
  const count = (changes ?? []).filter((change) => change.changed).length;
  if (count === 0) return "";
  return `${count} ungeprüfte Änderung(en)`;
}
