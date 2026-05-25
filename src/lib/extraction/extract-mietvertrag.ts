import { parseTenantAddress } from "@/lib/address";
import {
  cleanExtractedValue,
  compactExtraction,
  findByPatterns,
  findLabeledValue,
  isUsableAddressValue,
  missingIssues,
  normalizeLines,
  parseAreaValue,
  parseDateValue,
  parseEuroValue,
} from "@/lib/extraction/parser-utils";
import type { ExtractionIssue } from "@/lib/extraction/types";
import type { ExtractedData } from "@/types/case";

export function extractMietvertrag(text: string): { data: Partial<ExtractedData>; issues: ExtractionIssue[] } {
  const lines = normalizeLines(text);
  const mietobjekt = extractMietobjekt(lines, text);
  const parsedMietobjekt = mietobjekt ? parseTenantAddress(mietobjekt) : undefined;
  const landlordAddress = findLabeledValue(lines, ["Vermieter Adresse", "Adresse Vermieter", "Anschrift Vermieter"], { maxLookahead: 3 });
  const parsedLandlordAddress = splitPostalCity(landlordAddress);
  const grossRent = parseEuroValue(findLabeledValue(lines, ["Gesamtmiete", "Bruttomiete", "monatlicher Mietzins", "Monatliche Miete", "Mietzins monatlich"]));
  const contractArea = extractContractArea(lines, text);
  const representation = findLabeledValue(lines, ["Hausverwaltung", "Vertreten durch", "Vertretung", "Verwalter"], { maxLookahead: 2 });

  const data: Partial<ExtractedData> = {
    landlord: extractLandlord(lines, text),
    landlordAddress: parsedLandlordAddress.address,
    landlordPostalCity: parsedLandlordAddress.postalCity,
    landlordRepresentedBy: representation,
    representation,
    tenantName: extractTenant(lines, text),
    birthDate: parseDateValue(findLabeledValue(lines, ["Geburtsdatum", "Geboren am"])),
    tenantAddress: mietobjekt,
    tenantStreet: parsedMietobjekt?.street,
    tenantDoor: parsedMietobjekt?.door,
    tenantPostalCode: parsedMietobjekt?.postalCode,
    tenantCity: parsedMietobjekt?.city,
    tenantFullAddress: parsedMietobjekt?.fullAddress,
    leaseStart: parseDateValue(findLabeledValue(lines, ["Mietbeginn", "Beginn des Mietverhältnisses", "Vertragsbeginn"])),
    leaseEnd: parseDateValue(findLabeledValue(lines, ["Mietende", "Ende des Mietverhältnisses", "Vertragsende"])),
    grossRent,
    aktuelle_miete: grossRent,
    brutto_miete: grossRent,
    contractArea,
    nutzflaeche_laut_vertrag: contractArea,
    fixedTerm: /befristet|befristung|mietende|endet am/i.test(text) && !/\bunbefristet\b/i.test(text),
    deposit: parseEuroValue(findLabeledValue(lines, ["Kaution", "Mietkaution"])),
  };

  return { data: compactExtraction(data), issues: missingIssues<ExtractedData>(data, ["landlord", "tenantName", "leaseStart", "grossRent", "contractArea"]) };
}

function extractLandlord(lines: string[], text: string) {
  const value =
    findLabeledValue(lines, ["Vermieter", "Bestandgeber"], {
      maxLookahead: 2,
      requireValue: isUsableParty,
      stopLabels: ["Mieter", "Mieterin", "Bestandnehmer", "Mietgegenstand", "Mietobjekt", "Adresse"],
    }) ||
    findByPatterns(text, [
      /(?:Vermieter|Bestandgeber)\s*[:\-–]?\s*([^\n]{3,120})/i,
      /vertreten\s+durch\s+([^\n]{3,120})/i,
    ]);

  return cleanParty(value);
}

function extractTenant(lines: string[], text: string) {
  const value =
    findLabeledValue(lines, ["Mieter", "Mieterin", "Bestandnehmer"], {
      maxLookahead: 2,
      requireValue: isUsableParty,
      stopLabels: ["Vermieter", "Bestandgeber", "Mietgegenstand", "Mietobjekt", "Adresse"],
    }) || findByPatterns(text, [/(?:Mieter|Mieterin|Bestandnehmer)\s*[:\-–]?\s*([^\n]{3,120})/i]);

  return cleanParty(value);
}

function extractMietobjekt(lines: string[], text: string) {
  const value = findLabeledValue(lines, ["Mietgegenstand", "Mietobjekt Adresse", "Mietobjekt", "Bestandobjekt", "Wohnung"], {
    maxLookahead: 4,
    requireValue: isUsableAddressValue,
  });
  if (value) return value;

  return findByPatterns(text, [
    /(?:Mietgegenstand|Mietobjekt|Bestandobjekt|Wohnung)\s*[:\-–]?\s*([^\n]*(?:straße|strasse|gasse|platz|weg|allee|ring|kai|markt|zeile)[^\n]*)/i,
  ]);
}

function extractContractArea(lines: string[], text: string) {
  const labeled = parseAreaValue(findLabeledValue(lines, ["Nutzfläche", "Wohnnutzfläche", "Wohnfläche"], { maxLookahead: 2 }));
  if (labeled !== undefined) return labeled;

  return parseAreaValue(findByPatterns(text, [/\bca\.\s*(\d+(?:[.,]\d+)?)\s*(?:m²|m2|qm|Quadratmeter)\b/i, /\b(\d+(?:[.,]\d+)?)\s*(?:m²|m2|qm|Quadratmeter)\s+(?:Nutzfläche|Wohnfläche)\b/i]));
}

function splitPostalCity(value: string) {
  const match = value.match(/^(.*?)(?:,?\s+)(\d{4}\s+.+)$/);
  return {
    address: cleanExtractedValue(match?.[1] ?? value),
    postalCity: cleanExtractedValue(match?.[2] ?? ""),
  };
}

function cleanParty(value: string) {
  return cleanExtractedValue(value)
    .replace(/^(laut vertrag|vertragspartner|name)\s*/i, "")
    .replace(/\s+(?:als\s+)?(?:Vermieter|Bestandgeber|Mieter|Bestandnehmer)\b.*$/i, "")
    .trim();
}

function isUsableParty(value: string) {
  if (!value || value.length < 3) return false;
  if (/^(vertrag|mietvertrag|bestandvertrag|laut vertrag|name|adresse)$/i.test(value)) return false;
  if (/^(Vermieter|Bestandgeber|Mieter|Mieterin|Bestandnehmer)\b:?$/i.test(value)) return false;
  return /[A-Za-zÄÖÜäöüß]/.test(value);
}
