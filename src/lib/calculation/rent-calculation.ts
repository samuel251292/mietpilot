import type { CalculationInput, CalculationReport, CalculationResult, ExtractedData } from "@/types/case";

export type CalculationBasis<T = number | string | boolean> = {
  value: T;
  source: string;
  label: string;
};

export type RentCalculationSource = Partial<ExtractedData> & {
  currentRent?: unknown;
  allowedRent?: unknown;
  area?: unknown;
  reductionPercent?: unknown;
  paidDeductions?: unknown;
  betriebskosten?: unknown;
  umsatzsteuer?: unknown;
  sonstige_zuschlaege?: unknown;
  pauschalmietzins?: unknown;
  gesamtmiete_brutto?: unknown;
  vergleichsquote?: unknown;
  zukunftsreduktion_prozent?: unknown;
  zukuenftiger_mietzins?: unknown;
  bereits_rueckerstattet?: unknown;
  endDate?: string;
  pauschalmiete?: boolean;
  manualOverrides?: Record<string, unknown>;
  overriddenFields?: string[];
};

export type RichtwertCalculation = {
  mode: "befristet" | "unbefristet";
  area: number;
  guidelineRentPerSqm: number;
  usedGuidelineRentTotal: number;
  operatingCosts: number;
  vat: number;
  allowedGrossRent: number;
  allowedGrossRentFixedTerm: number;
  selectedAllowedGrossRent: number;
  selectedAllowedGrossRentSource: string;
};

export type RentComposition = {
  hauptmietzins: number;
  betriebskosten: number;
  umsatzsteuer: number;
  sonstige_zuschlaege: number;
  gesamtmiete_brutto: number;
  pauschalmietzins: number;
  isPauschalmietzins: boolean;
  warnings: string[];
};

export type RefundPeriod = {
  startDate: string;
  endDate: string;
  months: number;
  warnings: string[];
};

export type OverpaymentBreakdown = {
  monatliche_ueberzahlung: number;
  gesamte_ueberzahlung: number;
  bereits_rueckerstattet: number;
  offene_forderung: number;
};

export type SettlementBreakdown = {
  vergleichsquote: number;
  vergleichsbetrag: number;
  zukuenftiger_mietzins: number;
  zukuenftige_monatliche_ersparnis: number;
};

export type CalculationValidationResult = {
  warnings: string[];
};

type ReportOptions = {
  generatedAt?: string;
  generatedBy?: string;
  documentWarnings?: string[];
};

export function parseEuroValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/EUR|€/gi, " ")
    .trim();
  const match = normalized.match(/\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/);

  if (!match) return null;

  const token = match[0].replace(/\s/g, "");
  const hasComma = token.includes(",");
  const hasDot = token.includes(".");
  const decimalValue =
    hasComma && hasDot
      ? token.replace(/\./g, "").replace(",", ".")
      : hasComma
        ? token.replace(",", ".")
        : token;
  const parsed = Number(decimalValue);

  return Number.isFinite(parsed) ? parsed : null;
}

export function monthDiff(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    end.getMonth() -
    start.getMonth() +
    1;

  return Math.max(months, 0);
}

export function resolveCurrentRentBasis(extracted: RentCalculationSource): CalculationBasis<number> | undefined {
  if (isOverridden(extracted, "currentRent") || isOverridden(extracted, "gesamtmiete_brutto")) {
    const manual = positiveNumber(extracted.currentRent ?? extracted.gesamtmiete_brutto ?? extracted.aktuelle_miete);
    if (manual !== undefined) return { value: manual, source: "manual", label: "Manuell eingegeben" };
  }

  return firstPositiveBasis([
    [extracted.aktuelle_miete, "datenblatt.aktuelle_miete", "Aktuelle Miete aus Datenblatt"],
    [extracted.brutto_miete, "datenblatt.brutto_miete", "Brutto-Miete aus Datenblatt"],
    [extracted.grossRent, "datenblatt.grossRent", "Bruttomiete aus Extraktion"],
    [extracted.hauptmietzins, "datenblatt.hauptmietzins", "Hauptmietzins aus Datenblatt"],
    [extracted.currentRent, "manual.currentRent", "Manuell erfasste aktuelle Miete"],
  ]);
}

export function resolveAreaBasis(extracted: RentCalculationSource): CalculationBasis<number> | undefined {
  if (isOverridden(extracted, "area") || isOverridden(extracted, "nutzflaeche_nachgemessen")) {
    const manual = positiveNumber(extracted.area ?? extracted.nutzflaeche_nachgemessen);
    if (manual !== undefined) return { value: manual, source: "manual", label: "Manuell eingegeben" };
  }

  return firstPositiveBasis([
    [extracted.nutzflaeche_nachgemessen, "datenblatt.nutzflaeche_nachgemessen", "Quadratmeter nachgemessen"],
    [extracted.measuredArea, "richtwert.measuredArea", "Fläche aus Richtwert"],
    [extracted.area, "manual.area", "Manuell erfasste Fläche"],
    [extracted.nutzflaeche_laut_vertrag, "datenblatt.nutzflaeche_laut_vertrag", "Quadratmeter laut Vertrag"],
    [extracted.contractArea, "mietvertrag.contractArea", "Nutzfläche laut Mietvertrag"],
  ]);
}

export function resolveAllowedRentBasis(extracted: RentCalculationSource): CalculationBasis<number> | undefined {
  if (isOverridden(extracted, "allowedRent")) {
    const manual = positiveNumber(extracted.allowedRent ?? extracted.allowedGrossRent);
    if (manual !== undefined) return { value: manual, source: "manual", label: "Manuell eingegeben" };
  }

  const fixedTerm = Boolean(extracted.fixedTerm);
  const fixed = positiveNumber(extracted.allowedGrossRentFixedTerm);
  const regular = positiveNumber(extracted.allowedGrossRent ?? extracted.allowedRent);

  if (fixedTerm && fixed !== undefined) {
    return {
      value: fixed,
      source: "richtwert.allowedGrossRentFixedTerm",
      label: "Befristete erlaubte Bruttomiete aus Richtwert",
    };
  }

  if (regular !== undefined) {
    return {
      value: regular,
      source: "richtwert.allowedGrossRent",
      label: "Erlaubte Bruttomiete aus Richtwert",
    };
  }

  if (!fixedTerm && fixed !== undefined) {
    return {
      value: fixed,
      source: "richtwert.allowedGrossRentFixedTerm",
      label: "Befristete erlaubte Bruttomiete aus Richtwert",
    };
  }

  const derived = deriveRichtwertCalculation(extracted);
  if (derived.selectedAllowedGrossRent > 0) {
    return {
      value: derived.selectedAllowedGrossRent,
      source: derived.selectedAllowedGrossRentSource,
      label: fixedTerm ? "Intern hergeleitete befristete erlaubte Bruttomiete" : "Intern hergeleitete erlaubte Bruttomiete",
    };
  }

  return undefined;
}

export function resolvePeriodBasis(extracted: RentCalculationSource, fallbackEndDate = ""): CalculationBasis<{ startDate: string; endDate: string }> | undefined {
  const startDate = stringValue(extracted.leaseStart) || stringValue(extracted.moveInDate);
  const endDate = stringValue(extracted.endDate) || fallbackEndDate;
  if (!startDate && !endDate) return undefined;

  return {
    value: { startDate, endDate },
    source: isOverridden(extracted, "leaseStart") || isOverridden(extracted, "endDate") ? "manual" : startDate === extracted.moveInDate ? "datenblatt.moveInDate" : "extracted.leaseStart",
    label: isOverridden(extracted, "leaseStart") || isOverridden(extracted, "endDate") ? "Manuell eingegeben" : "Berechnungszeitraum aus Mietbeginn und Enddatum",
  };
}

export function buildCalculationInputFromExtracted(extracted: RentCalculationSource, options: { fallbackEndDate?: string } = {}): CalculationInput {
  const currentRent = resolveCurrentRentBasis(extracted);
  const allowedRent = resolveAllowedRentBasis(extracted);
  const area = resolveAreaBasis(extracted);
  const period = resolvePeriodBasis(extracted, options.fallbackEndDate);
  const warnings = createCalculationWarnings(extracted, currentRent, allowedRent, area, period);

  return {
    currentGrossRent: currentRent?.value ?? 0,
    aktuelle_miete: currentRent?.value ?? 0,
    allowedGrossRent: allowedRent?.value ?? 0,
    nutzflaeche: area?.value ?? 0,
    contractArea: positiveNumber(extracted.nutzflaeche_laut_vertrag) ?? positiveNumber(extracted.contractArea) ?? 0,
    measuredArea: positiveNumber(extracted.nutzflaeche_nachgemessen) ?? positiveNumber(extracted.measuredArea) ?? positiveNumber(extracted.area) ?? 0,
    fixedTerm: Boolean(extracted.fixedTerm),
    hauptmietzins: parseEuroValue(extracted.hauptmietzins) ?? parseEuroValue(extracted.netRent) ?? 0,
    betriebskosten: parseEuroValue(extracted.betriebskosten) ?? parseEuroValue(extracted.operatingCosts) ?? 0,
    umsatzsteuer: parseEuroValue(extracted.umsatzsteuer) ?? parseEuroValue(extracted.vat) ?? 0,
    sonstige_zuschlaege: parseEuroValue(extracted.sonstige_zuschlaege) ?? 0,
    pauschalmietzins: parseEuroValue(extracted.pauschalmietzins) ?? currentRent?.value ?? 0,
    pauschalmiete: Boolean(extracted.pauschalmiete),
    gesamtmiete_brutto: parseEuroValue(extracted.gesamtmiete_brutto) ?? currentRent?.value ?? 0,
    mietzins_pro_m2: currentRent?.value && area?.value ? currentRent.value / area.value : 0,
    richtwert_pro_m2: parseEuroValue(extracted.guidelineRentPerSqm) ?? 0,
    befristungsabschlag_prozent: Boolean(extracted.fixedTerm) ? 25 : 0,
    rueckforderungszeitraum_start: period?.value.startDate ?? "",
    rueckforderungszeitraum_ende: period?.value.endDate ?? "",
    startDate: period?.value.startDate ?? "",
    endDate: period?.value.endDate ?? "",
    paidDeductions: parseEuroValue(extracted.paidDeductions) ?? 0,
    bereits_rueckerstattet: parseEuroValue(extracted.bereits_rueckerstattet) ?? parseEuroValue(extracted.paidDeductions) ?? 0,
    settlementReductionPercent: parseEuroValue(extracted.reductionPercent) ?? 0,
    vergleichsquote: parseEuroValue(extracted.vergleichsquote) ?? 100 - (parseEuroValue(extracted.reductionPercent) ?? 0),
    zukunftsreduktion_prozent: parseEuroValue(extracted.zukunftsreduktion_prozent) ?? parseEuroValue(extracted.reductionPercent) ?? 0,
    zukuenftiger_mietzins: parseEuroValue(extracted.zukuenftiger_mietzins) ?? 0,
    manualOverrides: extracted.manualOverrides ?? {},
    overriddenFields: extracted.overriddenFields ?? [],
    currentRentSource: currentRent?.source,
    allowedRentSource: allowedRent?.source,
    areaSource: area?.source,
    periodSource: period?.source,
    calculationWarnings: warnings,
    calculationBasis: {
      currentRent,
      allowedRent,
      area,
      period,
      richtwert: deriveRichtwertCalculation(extracted),
    },
  };
}

export function deriveRichtwertCalculation(extracted: RentCalculationSource): RichtwertCalculation {
  const area = resolveAreaBasis(extracted)?.value ?? 0;
  const guidelineRentPerSqm = parseEuroValue(extracted.guidelineRentPerSqm) ?? 0;
  const regularGuidelineRentTotal = parseEuroValue(extracted.guidelineRentTotal) ?? guidelineRentPerSqm * area;
  const fixedGuidelineRentTotal = regularGuidelineRentTotal * 0.75;
  const operatingCostPerSqm = parseEuroValue(extracted.operatingCostPerSqm) ?? 0;
  const operatingCosts = parseEuroValue(extracted.operatingCosts) ?? operatingCostPerSqm * area;
  const regularNet = regularGuidelineRentTotal + operatingCosts;
  const fixedNet = fixedGuidelineRentTotal + operatingCosts;
  const regularVat = regularNet * 0.1;
  const fixedVat = fixedNet * 0.1;
  const calculatedAllowedGrossRent = regularNet + regularVat;
  const calculatedAllowedGrossRentFixedTerm = fixedNet + fixedVat;
  const extractedAllowedGrossRent = positiveNumber(extracted.allowedGrossRent ?? extracted.allowedRent);
  const extractedAllowedGrossRentFixedTerm = positiveNumber(extracted.allowedGrossRentFixedTerm);
  const fixedTerm = Boolean(extracted.fixedTerm);
  const selectedAllowedGrossRent =
    fixedTerm
      ? extractedAllowedGrossRentFixedTerm ?? extractedAllowedGrossRent ?? calculatedAllowedGrossRentFixedTerm
      : extractedAllowedGrossRent ?? calculatedAllowedGrossRent;

  return {
    mode: fixedTerm ? "befristet" : "unbefristet",
    area,
    guidelineRentPerSqm,
    usedGuidelineRentTotal: fixedTerm ? fixedGuidelineRentTotal : regularGuidelineRentTotal,
    operatingCosts,
    vat: fixedTerm ? fixedVat : regularVat,
    allowedGrossRent: extractedAllowedGrossRent ?? calculatedAllowedGrossRent,
    allowedGrossRentFixedTerm: extractedAllowedGrossRentFixedTerm ?? calculatedAllowedGrossRentFixedTerm,
    selectedAllowedGrossRent,
    selectedAllowedGrossRentSource:
      fixedTerm && extractedAllowedGrossRentFixedTerm !== undefined
        ? "richtwert.allowedGrossRentFixedTerm"
        : extractedAllowedGrossRent !== undefined
          ? "richtwert.allowedGrossRent"
          : fixedTerm
            ? "calculated.allowedGrossRentFixedTerm"
            : "calculated.allowedGrossRent",
  };
}

export function calculateRentComposition(input: CalculationInput): RentComposition {
  const hauptmietzins = parseEuroValue(input.hauptmietzins) ?? 0;
  const betriebskosten = parseEuroValue(input.betriebskosten) ?? 0;
  const umsatzsteuer = parseEuroValue(input.umsatzsteuer) ?? 0;
  const sonstige_zuschlaege = parseEuroValue(input.sonstige_zuschlaege) ?? 0;
  const gesamtmiete_brutto = parseEuroValue(input.gesamtmiete_brutto) ?? parseEuroValue(input.currentGrossRent) ?? 0;
  const hasComponents = [hauptmietzins, betriebskosten, umsatzsteuer, sonstige_zuschlaege].some((value) => value > 0);
  const forcedPauschal = Boolean(input.pauschalmiete);
  const pauschalmietzins = hasComponents && !forcedPauschal ? (parseEuroValue(input.pauschalmietzins) ?? 0) : gesamtmiete_brutto;
  const warnings: string[] = [];

  if (gesamtmiete_brutto > 0 && (!hasComponents || forcedPauschal)) warnings.push("Nur Pauschalmiete erkannt.");
  if (gesamtmiete_brutto > 0 && (!hasComponents || forcedPauschal)) warnings.push("Mietzusammensetzung nicht vollständig bekannt.");
  if (betriebskosten <= 0) warnings.push("Betriebskosten unbekannt.");
  if (umsatzsteuer <= 0) warnings.push("Umsatzsteuer unbekannt.");

  return {
    hauptmietzins,
    betriebskosten,
    umsatzsteuer,
    sonstige_zuschlaege,
    gesamtmiete_brutto,
    pauschalmietzins,
    isPauschalmietzins: pauschalmietzins > 0 && (!hasComponents || forcedPauschal),
    warnings,
  };
}

export function calculateRefundPeriod(input: CalculationInput): RefundPeriod {
  const startDate = input.rueckforderungszeitraum_start || input.startDate || "";
  const endDate = input.rueckforderungszeitraum_ende || input.endDate || "";
  const months = monthDiff(startDate, endDate);
  const warnings: string[] = [];

  if (!startDate || !endDate) warnings.push("Zeitraum fehlt.");
  if (months <= 0) warnings.push("Zeitraum 0 Monate.");
  if (months > 120) warnings.push("Rückforderungszeitraum ungewöhnlich lang.");

  return { startDate, endDate, months, warnings };
}

export function calculateOverpayment(input: CalculationInput, period = calculateRefundPeriod(input)): OverpaymentBreakdown {
  const currentGrossRent = parseEuroValue(input.aktuelle_miete) ?? parseEuroValue(input.currentGrossRent) ?? 0;
  const allowedGrossRent = parseEuroValue(input.allowedGrossRent) ?? 0;
  const monatliche_ueberzahlung = Math.max(currentGrossRent - allowedGrossRent, 0);
  const gesamte_ueberzahlung = monatliche_ueberzahlung * period.months;
  const bereits_rueckerstattet = parseEuroValue(input.bereits_rueckerstattet) ?? parseEuroValue(input.paidDeductions) ?? 0;
  const offene_forderung = Math.max(gesamte_ueberzahlung - bereits_rueckerstattet, 0);

  return {
    monatliche_ueberzahlung,
    gesamte_ueberzahlung,
    bereits_rueckerstattet,
    offene_forderung,
  };
}

export function calculateSettlementBreakdown(input: CalculationInput, overpayment = calculateOverpayment(input)): SettlementBreakdown {
  const currentGrossRent = parseEuroValue(input.aktuelle_miete) ?? parseEuroValue(input.currentGrossRent) ?? 0;
  const allowedGrossRent = parseEuroValue(input.allowedGrossRent) ?? 0;
  const reductionPercent = parseEuroValue(input.settlementReductionPercent) ?? 0;
  const vergleichsquote = parseEuroValue(input.vergleichsquote) ?? Math.max(100 - reductionPercent, 0);
  const vergleichsbetrag = Math.max(overpayment.gesamte_ueberzahlung * (vergleichsquote / 100) - overpayment.bereits_rueckerstattet, 0);
  const manualFutureRent = input.overriddenFields?.includes("zukuenftiger_mietzins") ? positiveNumber(input.zukuenftiger_mietzins) : undefined;
  const futureReductionPercent = input.overriddenFields?.includes("zukunftsreduktion_prozent") ? parseEuroValue(input.zukunftsreduktion_prozent) : null;
  const calculatedFutureRent = futureReductionPercent !== null
    ? currentGrossRent * (1 - futureReductionPercent / 100)
    : currentGrossRent - overpayment.monatliche_ueberzahlung * (vergleichsquote / 100);
  const zukuenftiger_mietzins = manualFutureRent ?? calculatedFutureRent;
  const zukuenftige_monatliche_ersparnis = Math.max(currentGrossRent - zukuenftiger_mietzins, 0);

  return {
    vergleichsquote,
    vergleichsbetrag,
    zukuenftiger_mietzins: zukuenftiger_mietzins > 0 ? zukuenftiger_mietzins : allowedGrossRent,
    zukuenftige_monatliche_ersparnis,
  };
}

export function validateCalculationInput(input: CalculationInput, months = monthDiff(input.startDate, input.endDate)): CalculationValidationResult {
  const warnings = [...(input.calculationWarnings ?? [])];
  const currentGrossRent = parseEuroValue(input.currentGrossRent) ?? 0;
  const allowedGrossRent = parseEuroValue(input.allowedGrossRent) ?? 0;
  const area = parseEuroValue(input.nutzflaeche) ?? 0;
  const vergleichsquote = parseEuroValue(input.vergleichsquote);
  const zukunftsreduktion = parseEuroValue(input.zukunftsreduktion_prozent);

  if (currentGrossRent <= 0) warnings.push("Aktuelle Miete fehlt.");
  if (currentGrossRent < 0 || allowedGrossRent < 0) warnings.push("Negative Miete erkannt.");
  if (allowedGrossRent <= 0) warnings.push("Erlaubte Miete fehlt.");
  if (!input.startDate) warnings.push("Mietbeginn fehlt.");
  if (!input.startDate || !input.endDate) warnings.push("Zeitraum fehlt.");
  if (months <= 0) warnings.push("Zeitraum 0 Monate.");
  if (input.startDate && input.endDate && new Date(input.endDate).getTime() < new Date(input.startDate).getTime()) warnings.push("Zeitraum Ende liegt vor Start.");
  if (area <= 0) warnings.push("Nutzfläche fehlt.");
  if (area > 0 && (area < 15 || area > 250)) warnings.push("Nutzfläche ungewöhnlich klein/groß.");
  if ((parseEuroValue(input.richtwert_pro_m2) ?? 0) <= 0) warnings.push("Richtwert fehlt.");
  if (vergleichsquote !== null && (vergleichsquote < 0 || vergleichsquote > 100)) warnings.push("Vergleichsquote muss zwischen 0 und 100 liegen.");
  if (zukunftsreduktion !== null && (zukunftsreduktion < 0 || zukunftsreduktion > 100)) warnings.push("Zukunftsreduktion muss zwischen 0 und 100 liegen.");
  if ((parseEuroValue(input.bereits_rueckerstattet) ?? 0) < 0) warnings.push("Bereits rückerstattet darf nicht negativ sein.");
  if (input.fixedTerm && allowedGrossRent > 0 && !input.allowedRentSource?.includes("FixedTerm")) warnings.push("Befristung erkannt, aber keine reduzierte erlaubte Miete vorhanden.");

  return { warnings: uniqueWarnings(warnings) };
}

export function validateCalculationResult(result: CalculationResult): CalculationValidationResult {
  const warnings: string[] = [];
  if (result.monthlyExcess !== (result.monatliche_ueberzahlung ?? result.monthlyExcess)) warnings.push("Berechnung inkonsistent: monthlyExcess weicht von monatlicher Überzahlung ab.");
  if (result.totalExcess !== (result.gesamte_ueberzahlung ?? result.totalExcess)) warnings.push("Berechnung inkonsistent: totalExcess weicht von Gesamtüberzahlung ab.");
  if (result.settlementAmount !== (result.vergleichsbetrag ?? result.settlementAmount)) warnings.push("Berechnung inkonsistent: settlementAmount weicht von Vergleichsbetrag ab.");
  if (result.futureAcceptedRent !== (result.zukuenftiger_mietzins ?? result.futureAcceptedRent)) warnings.push("Berechnung inkonsistent: futureAcceptedRent weicht von zukünftiger Miete ab.");
  return { warnings };
}

export function calculateSettlement(input: CalculationInput): CalculationResult {
  const currentGrossRent = parseEuroValue(input.aktuelle_miete) ?? parseEuroValue(input.currentGrossRent) ?? 0;
  const allowedGrossRent = parseEuroValue(input.allowedGrossRent) ?? 0;
  const composition = calculateRentComposition({ ...input, currentGrossRent, allowedGrossRent });
  const period = calculateRefundPeriod(input);
  const overpayment = calculateOverpayment({ ...input, currentGrossRent, allowedGrossRent }, period);
  const settlement = calculateSettlementBreakdown({ ...input, currentGrossRent, allowedGrossRent }, overpayment);
  const paidDeductions = overpayment.bereits_rueckerstattet;
  const settlementReductionPercent = parseEuroValue(input.settlementReductionPercent) ?? 0;
  const validation = validateCalculationInput(input, period.months);

  const result: CalculationResult = {
    ...input,
    currentGrossRent,
    allowedGrossRent,
    paidDeductions,
    settlementReductionPercent,
    vergleichsquote: settlement.vergleichsquote,
    monthlyExcess: overpayment.monatliche_ueberzahlung,
    monatliche_ueberzahlung: overpayment.monatliche_ueberzahlung,
    months: period.months,
    rueckforderungszeitraum_monate: period.months,
    totalExcess: overpayment.gesamte_ueberzahlung,
    gesamte_ueberzahlung: overpayment.gesamte_ueberzahlung,
    bereits_rueckerstattet: overpayment.bereits_rueckerstattet,
    offene_forderung: overpayment.offene_forderung,
    settlementAmount: settlement.vergleichsbetrag,
    vergleichsbetrag: settlement.vergleichsbetrag,
    futureAcceptedRent: settlement.zukuenftiger_mietzins,
    zukuenftiger_mietzins: settlement.zukuenftiger_mietzins,
    zukuenftige_monatliche_ersparnis: settlement.zukuenftige_monatliche_ersparnis,
    hauptmietzins: composition.hauptmietzins,
    betriebskosten: composition.betriebskosten,
    umsatzsteuer: composition.umsatzsteuer,
    sonstige_zuschlaege: composition.sonstige_zuschlaege,
    gesamtmiete_brutto: composition.gesamtmiete_brutto,
    pauschalmietzins: composition.pauschalmietzins,
    pauschalmiete: composition.isPauschalmietzins,
    rueckforderungszeitraum_start: period.startDate,
    rueckforderungszeitraum_ende: period.endDate,
    manualOverrides: input.manualOverrides,
    overriddenFields: input.overriddenFields,
    calculationWarnings: validation.warnings,
    calculationBasis: {
      ...(input.calculationBasis ?? {}),
      composition,
      refundPeriod: period,
      overpayment,
      settlement,
    },
  };
  const resultValidation = validateCalculationResult(result);

  return {
    ...result,
    calculationWarnings: uniqueWarnings([...validation.warnings, ...composition.warnings, ...period.warnings, ...resultValidation.warnings]),
  };
}

export function buildCalculationReport(
  input: CalculationInput,
  result: CalculationResult,
  extracted: Partial<ExtractedData> = {},
  options: ReportOptions = {},
): CalculationReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const warnings = uniqueWarnings([...(result.calculationWarnings ?? []), ...(options.documentWarnings ?? [])]);

  return {
    generatedAt,
    generatedBy: options.generatedBy,
    sections: [
      {
        title: "Mietzusammensetzung",
        entries: [
          reportEntry("Hauptmietzins", result.hauptmietzins, "money", sourceFor(input, "hauptmietzins", "datenblatt.hauptmietzins")),
          reportEntry("Betriebskosten", result.betriebskosten, "money", sourceFor(input, "betriebskosten", "richtwert.operatingCosts")),
          reportEntry("Umsatzsteuer", result.umsatzsteuer, "money", sourceFor(input, "umsatzsteuer", "richtwert.vat")),
          reportEntry("Zuschläge", result.sonstige_zuschlaege, "money", sourceFor(input, "sonstige_zuschlaege")),
          reportEntry("Gesamtmiete brutto", result.gesamtmiete_brutto ?? result.currentGrossRent, "money", sourceFor(input, "currentRent", result.currentRentSource)),
        ],
      },
      {
        title: "Nutzfläche & Richtwert",
        entries: [
          reportEntry("Nutzfläche laut Vertrag", result.contractArea ?? extracted.contractArea, "area", sourceFor(input, "contractArea", "datenblatt.nutzflaeche_laut_vertrag")),
          reportEntry("Nutzfläche nachgemessen", result.measuredArea ?? extracted.measuredArea, "area", sourceFor(input, "measuredArea", "datenblatt.nutzflaeche_nachgemessen")),
          reportEntry("Verwendete Nutzfläche", result.nutzflaeche, "area", sourceFor(input, "area", result.areaSource)),
          reportEntry("Richtwert/m²", result.richtwert_pro_m2 ?? extracted.guidelineRentPerSqm, "money", sourceFor(input, "guidelineRentPerSqm", "richtwert.guidelineRentPerSqm")),
          reportEntry("Befristung", result.fixedTerm ? "Ja" : "Nein", "text", sourceFor(input, "fixedTerm", "extracted.fixedTerm")),
          reportEntry("Verwendete erlaubte Miete", result.allowedGrossRent, "money", sourceFor(input, "allowedRent", result.allowedRentSource)),
        ],
      },
      {
        title: "Rückforderung",
        entries: [
          reportEntry("Zeitraum", `${result.rueckforderungszeitraum_start || result.startDate || "Fehlt"} bis ${result.rueckforderungszeitraum_ende || result.endDate || "Fehlt"}`, "text", sourceFor(input, "period", result.periodSource)),
          reportEntry("Monatliche Überzahlung", result.monatliche_ueberzahlung ?? result.monthlyExcess, "money"),
          reportEntry("Gesamtüberzahlung", result.gesamte_ueberzahlung ?? result.totalExcess, "money"),
          reportEntry("Bereits rückerstattet", result.bereits_rueckerstattet ?? result.paidDeductions, "money", sourceFor(input, "bereits_rueckerstattet")),
          reportEntry("Offene Forderung", result.offene_forderung, "money"),
        ],
      },
      {
        title: "Vergleich",
        entries: [
          reportEntry("Vergleichsquote", result.vergleichsquote, "percent", sourceFor(input, "vergleichsquote")),
          reportEntry("Vergleichsbetrag", result.vergleichsbetrag ?? result.settlementAmount, "money"),
          reportEntry("Zukünftiger Mietzins", result.zukuenftiger_mietzins ?? result.futureAcceptedRent, "money", sourceFor(input, "zukuenftiger_mietzins")),
          reportEntry("Zukünftige Ersparnis", result.zukuenftige_monatliche_ersparnis, "money"),
        ],
      },
      {
        title: "Warnungen",
        entries: warnings.length > 0
          ? warnings.map((warning) => ({ label: warning, value: warning, formattedValue: warning, warning }))
          : [{ label: "Keine Warnungen", value: "Keine Warnungen", formattedValue: "Keine Warnungen" }],
      },
    ],
    warnings,
    summary: {
      monthlyOverpayment: result.monatliche_ueberzahlung ?? result.monthlyExcess,
      totalOverpayment: result.gesamte_ueberzahlung ?? result.totalExcess,
      settlementAmount: result.vergleichsbetrag ?? result.settlementAmount,
      futureAcceptedRent: result.zukuenftiger_mietzins ?? result.futureAcceptedRent,
      futureMonthlySavings: result.zukuenftige_monatliche_ersparnis,
    },
  };
}

function createCalculationWarnings(
  extracted: RentCalculationSource,
  currentRent: CalculationBasis<number> | undefined,
  allowedRent: CalculationBasis<number> | undefined,
  area: CalculationBasis<number> | undefined,
  period: CalculationBasis<{ startDate: string; endDate: string }> | undefined,
) {
  const warnings: string[] = [];
  if (!currentRent) warnings.push("Aktuelle Miete fehlt.");
  if (!allowedRent) warnings.push("Erlaubte Miete fehlt.");
  if (!area) warnings.push("Nutzfläche fehlt.");
  if (!period?.value.startDate) warnings.push("Mietbeginn fehlt.");
  if (extracted.fixedTerm && !positiveNumber(extracted.allowedGrossRentFixedTerm)) {
    warnings.push("Befristung erkannt, aber keine reduzierte erlaubte Miete vorhanden.");
  }
  return warnings;
}

function reportEntry(label: string, value: unknown, format: "money" | "area" | "percent" | "text", source?: string): CalculationReport["sections"][number]["entries"][number] {
  const overridden = source === "manual";
  return {
    label,
    value,
    formattedValue: formatReportValue(value, format),
    source,
    overridden,
    warning: overridden ? "Manuell angepasst" : undefined,
  };
}

function sourceFor(input: CalculationInput, field: string, fallback?: string) {
  if (input.overriddenFields?.includes(field) || Object.prototype.hasOwnProperty.call(input.manualOverrides ?? {}, field)) return "manual";
  return fallback;
}

function formatReportValue(value: unknown, format: "money" | "area" | "percent" | "text") {
  if (value === undefined || value === null || value === "") return "Fehlt";
  if (format === "text") return String(value);
  const numeric = parseEuroValue(value);
  if (numeric === null || numeric <= 0) return "Fehlt";
  if (format === "money") return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(numeric);
  if (format === "area") return `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(numeric)} m²`;
  return `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(numeric)} %`;
}

function isOverridden(extracted: RentCalculationSource, field: string) {
  return extracted.overriddenFields?.includes(field) || Object.prototype.hasOwnProperty.call(extracted.manualOverrides ?? {}, field);
}

function firstPositiveBasis(items: Array<[unknown, string, string]>): CalculationBasis<number> | undefined {
  for (const [rawValue, source, label] of items) {
    const value = positiveNumber(rawValue);
    if (value !== undefined) return { value, source, label };
  }
  return undefined;
}

function positiveNumber(value: unknown) {
  const parsed = parseEuroValue(value);
  return parsed !== null && parsed > 0 ? parsed : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueWarnings(warnings: string[]) {
  return Array.from(new Set(warnings.filter(Boolean)));
}
