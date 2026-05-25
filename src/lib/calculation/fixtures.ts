import { buildCalculationInputFromExtracted, calculateSettlement } from "@/lib/calculation/rent-calculation";
import type { CalculationInput, CalculationResult } from "@/types/case";

export type CalculationFixture = {
  id: string;
  description: string;
  input: CalculationInput;
  result: CalculationResult;
};

const today = "2026-05-22";

export const calculationFixtures: CalculationFixture[] = [
  createFixture("normaler-fall", "Normaler Fall mit getrennten Mietbestandteilen", {
    aktuelle_miete: 620,
    allowedGrossRent: 360,
    hauptmietzins: 430,
    betriebskosten: 120,
    umsatzsteuer: 70,
    nutzflaeche: 42,
    richtwert_pro_m2: 6.67,
    startDate: "2024-01-01",
    endDate: today,
    paidDeductions: 0,
    settlementReductionPercent: 30,
  }),
  createFixture("befristeter-fall", "Befristeter Fall mit reduzierter erlaubter Miete", {
    aktuelle_miete: 700,
    allowedGrossRent: 410,
    allowedRentSource: "richtwert.allowedGrossRentFixedTerm",
    fixedTerm: true,
    nutzflaeche: 38,
    richtwert_pro_m2: 6.67,
    startDate: "2023-06-01",
    endDate: today,
    paidDeductions: 0,
    settlementReductionPercent: 25,
  }),
  createFixture("fehlender-richtwert", "Fall mit fehlendem Richtwert und Warnung", {
    aktuelle_miete: 540,
    allowedGrossRent: 0,
    nutzflaeche: 35,
    startDate: "2024-03-01",
    endDate: today,
    paidDeductions: 0,
    settlementReductionPercent: 30,
  }),
  createFixture("pauschalmiete", "Nur Pauschalmiete ohne vollständige Zusammensetzung", {
    aktuelle_miete: 480,
    allowedGrossRent: 260,
    gesamtmiete_brutto: 480,
    pauschalmiete: true,
    nutzflaeche: 28,
    richtwert_pro_m2: 6.67,
    startDate: "2024-01-15",
    endDate: today,
    paidDeductions: 0,
    settlementReductionPercent: 30,
  }),
  createFixture("bereits-rueckerstattet", "Fall mit bereits rückerstatteten Beträgen", {
    aktuelle_miete: 650,
    allowedGrossRent: 390,
    nutzflaeche: 44,
    richtwert_pro_m2: 6.67,
    startDate: "2024-01-01",
    endDate: today,
    paidDeductions: 500,
    bereits_rueckerstattet: 500,
    settlementReductionPercent: 30,
  }),
  createFixture("ocr-fall", "OCR-Fall mit knapper Datenbasis und Warnungen", buildCalculationInputFromExtracted({
    aktuelle_miete: 590,
    allowedGrossRent: 0,
    nutzflaeche_nachgemessen: 31,
    leaseStart: "2024-04-01",
    endDate: today,
  })),
];

function createFixture(id: string, description: string, input: Partial<CalculationInput>): CalculationFixture {
  const normalized: CalculationInput = {
    currentGrossRent: Number(input.aktuelle_miete ?? input.currentGrossRent ?? 0),
    allowedGrossRent: Number(input.allowedGrossRent ?? 0),
    startDate: input.startDate ?? "",
    endDate: input.endDate ?? "",
    paidDeductions: Number(input.paidDeductions ?? 0),
    settlementReductionPercent: Number(input.settlementReductionPercent ?? 0),
    ...input,
  };

  return {
    id,
    description,
    input: normalized,
    result: calculateSettlement(normalized),
  };
}
