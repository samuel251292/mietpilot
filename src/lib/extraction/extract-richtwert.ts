import { getViennaPostalCodeForDistrict, parseTenantAddress } from "@/lib/address";
import {
  compactExtraction,
  findByPatterns,
  findLabeledValue,
  isUsableAddressValue,
  missingIssues,
  normalizeLines,
  parseAreaValue,
  parseEuroValue,
} from "@/lib/extraction/parser-utils";
import type { ExtractionIssue } from "@/lib/extraction/types";
import type { ExtractedData } from "@/types/case";

export function extractRichtwert(text: string): { data: Partial<ExtractedData>; issues: ExtractionIssue[] } {
  const lines = normalizeLines(text);
  const anschrift = findLabeledValue(lines, ["Anschrift"], { maxLookahead: 3, requireValue: isUsableAddressValue });
  const address = anschrift ? parseRichtwertAddress(anschrift) : undefined;
  const fixedTermGrossRent = extractFixedTermAllowedGrossRent(text);
  const regularGrossRent = extractRegularAllowedGrossRent(text);

  const data: Partial<ExtractedData> = {
    tenantAddress: anschrift,
    tenantStreet: address?.street,
    tenantDoor: address?.door,
    tenantPostalCode: address?.postalCode,
    tenantCity: address?.city,
    tenantFullAddress: address?.fullAddress,
    category: findLabeledValue(lines, ["Kategorie", "Wohnungskategorie"]),
    guidelineRentPerSqm: parseEuroValue(findLabeledValue(lines, ["Richtwertzins pro m²", "Richtwertzins pro m2", "Richtwertzins/m²", "Richtwertzins/m2", "Richtwert pro m²", "Richtwert pro m2"])),
    measuredArea: parseAreaValue(findLabeledValue(lines, ["Nutzfläche", "Wohnnutzfläche", "Wohnfläche"])),
    operatingCostPerSqm: parseEuroValue(findLabeledValue(lines, ["Betriebskostensatz pro m²", "Betriebskostensatz pro m2", "Betriebskosten pro m²", "Betriebskosten pro m2", "BK pro m²", "BK pro m2", "Betriebskostensatz"])),
    guidelineRentTotal: parseEuroValue(findLabeledValue(lines, ["Richtwertzins Wohnung exkl. Betriebskosten und USt", "Richtwertzins Wohnung", "Richtwertzins gesamt"])),
    netRent: parseEuroValue(findLabeledValue(lines, ["Gesamtmiete Netto", "Nettomiete gesamt"])),
    allowedGrossRent: regularGrossRent ?? fixedTermGrossRent,
    allowedGrossRentFixedTerm: fixedTermGrossRent,
    operatingCosts: parseEuroValue(findLabeledValue(lines, ["Betriebskosten", "BK"])),
    vat: parseEuroValue(findLabeledValue(lines, ["Umsatzsteuer", "USt", "Mehrwertsteuer"])),
    adjustments: findLabeledValue(lines, ["Zuschläge Abschläge", "Zuschläge/Abschläge", "Zu- und Abschläge", "Lagezuschlag"], { maxLookahead: 3 }),
  };

  return { data: compactExtraction(data), issues: missingIssues<ExtractedData>(data, ["allowedGrossRent", "guidelineRentPerSqm", "measuredArea", "category"]) };
}

function extractFixedTermAllowedGrossRent(text: string) {
  return parseEuroValue(
    findByPatterns(text, [
      /Die\s+Gesamtmiete\s+Brutto\s+reduziert\s+sich\s+somit\s+auf\s*(?:EUR|€)?\s*([\d.,\s]+)/i,
      /Gesamtmiete\s+Brutto\s+reduziert\s+sich\s+somit\s+auf\s*(?:EUR|€)?\s*([\d.,\s]+)/i,
      /reduzierte\s+Gesamtmiete\s+Brutto\s*[:\-–]?\s*(?:EUR|€)?\s*([\d.,\s]+)/i,
      /Erlaubte\s+Miete\s+brutto\s+befristet\s*[:\-–]?\s*(?:EUR|€)?\s*([\d.,\s]+)/i,
    ]),
  );
}

function extractRegularAllowedGrossRent(text: string) {
  return parseEuroValue(
    findByPatterns(text, [
      /(?:^|\n)\s*(?:Erlaubte|Zulässige)\s+(?:Gesamtmiete|Miete)\s+brutto\s*[:\-–]?\s*(?:EUR|€)?\s*([\d.,\s]+)/i,
      /(?:^|\n)\s*Bruttomiete\s+zulässig\s*[:\-–]?\s*(?:EUR|€)?\s*([\d.,\s]+)/i,
      /(?:^|\n)\s*Gesamtmiete\s+Brutto\s*[:\-–]?\s*(?:EUR|€)?\s*([\d.,\s]+)/i,
    ]),
  );
}

function parseRichtwertAddress(value: string) {
  const districtMatch = value.match(/^\s*(\d{1,2})\.\s*,?\s*(.+)$/);
  const parsed = parseTenantAddress(value);

  if (!districtMatch) return parsed;

  const postalCode = getViennaPostalCodeForDistrict(districtMatch[1]);
  const streetWithDoor = districtMatch[2].trim();
  const streetParsed = parseTenantAddress(streetWithDoor);

  return {
    street: streetParsed.street,
    door: streetParsed.door,
    postalCode,
    city: postalCode ? "Wien" : "",
    fullAddress: postalCode ? `${streetWithDoor}, ${postalCode} Wien` : streetWithDoor,
  };
}
