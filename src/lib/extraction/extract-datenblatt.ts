import { parseTenantAddress } from "@/lib/address";
import {
  compactExtraction,
  findByPatterns,
  findLabeledValue,
  isUsableAddressValue,
  missingIssues,
  normalizeLines,
  parseAreaValue,
  parseBooleanValue,
  parseDateValue,
  parseEuroValue,
} from "@/lib/extraction/parser-utils";
import type { ExtractionIssue } from "@/lib/extraction/types";
import type { ExtractedData } from "@/types/case";

export function extractDatenblatt(text: string): { data: Partial<ExtractedData>; issues: ExtractionIssue[] } {
  const lines = normalizeLines(text);
  const wohnungsadresse = extractWohnungsadresse(lines, text);
  const address = wohnungsadresse ? parseTenantAddress(wohnungsadresse) : undefined;
  const bruttoMiete = parseEuroValue(findLabeledValue(lines, ["Brutto-Miete", "Brutto Miete", "Bruttomiete", "Bruttomietzins"]));
  const hauptmietzins = parseEuroValue(findLabeledValue(lines, ["Hauptmietzins"]));
  const aktuelleMiete = bruttoMiete ?? hauptmietzins;
  const contractArea = parseAreaValue(findLabeledValue(lines, ["Quadratmeter Vertrag", "Quadratmeter laut Vertrag", "Nutzfläche laut Vertrag", "Wohnfläche laut Vertrag"]));
  const measuredArea = parseAreaValue(findLabeledValue(lines, ["Quadratmeter nachgemessen", "Nutzfläche nachgemessen", "Wohnfläche nachgemessen"]));
  const fixedTerm = extractFixedTerm(lines, text);
  const ausstattung = findLabeledValue(lines, ["Ausstattung", "Ausstattungsmerkmale"], { maxLookahead: 3 });

  const data: Partial<ExtractedData> = {
    opposingParty: findLabeledValue(lines, ["Antragsgegner"]),
    representation: findLabeledValue(lines, ["Vertretung"]),
    caseWorker: findLabeledValue(lines, ["Sachbearbeiter", "Sachbearbeiterin", "Bearbeiter"]),
    tenantName: findLabeledValue(lines, ["Mieter/Mieterinnen", "Mieterinnen", "Mieter Name", "Mieter/in", "Antragsteller"], { maxLookahead: 2 }),
    tenantAddress: wohnungsadresse,
    tenantStreet: address?.street,
    tenantDoor: address?.door,
    tenantPostalCode: address?.postalCode,
    tenantCity: address?.city,
    tenantFullAddress: address?.fullAddress,
    phone: findLabeledValue(lines, ["Telefonnummer", "Telefon", "Tel", "Mobil"]),
    moveInDate: parseDateValue(findLabeledValue(lines, ["Einzugsdatum", "Einzug"])),
    leaseStart: parseDateValue(findLabeledValue(lines, ["Einzugsdatum", "Einzug", "Mietbeginn"])),
    grossRent: aktuelleMiete,
    aktuelle_miete: aktuelleMiete,
    brutto_miete: bruttoMiete,
    hauptmietzins,
    contractArea,
    measuredArea,
    nutzflaeche_laut_vertrag: contractArea,
    nutzflaeche_nachgemessen: measuredArea,
    category: findLabeledValue(lines, ["Kategorie/Anmerkungen", "Kategorie", "Wohnungskategorie"]),
    fixedTerm,
    equipment: ausstattung,
    bathToiletSameRoom: parseBooleanValue(findLabeledValue(lines, ["Bad/WC ein Raum", "Bad und WC in einem Raum", "Bad WC ein Raum"])),
    corridorKitchen: parseBooleanValue(findLabeledValue(lines, ["Gangküche", "Gang Küche"])),
    noiseImpact: parseBooleanValue(findLabeledValue(lines, ["Lärmbeeinträchtigung", "Lärm", "Laermbeeintraechtigung"])),
    intercom: parseBooleanValue(findLabeledValue(lines, ["Gegensprechanlage"])),
    cellar: parseBooleanValue(findLabeledValue(lines, ["Kellerabteil", "Keller"])),
  };

  return { data: compactExtraction(data), issues: missingIssues<ExtractedData>(data, ["opposingParty", "tenantName", "tenantFullAddress", "grossRent", "measuredArea"]) };
}

function extractWohnungsadresse(lines: string[], text: string) {
  const labeled = findLabeledValue(lines, ["Adresse der Wohnung", "Wohnungsadresse", "Objektadresse", "Mietobjekt", "Adresse"], {
    maxLookahead: 3,
    requireValue: isUsableAddressValue,
  });
  if (labeled) return labeled;

  return findByPatterns(text, [
    /(?:Adresse|Wohnungsadresse|Objektadresse)\s*[:\-–]?\s*([^\n]*(?:straße|strasse|gasse|platz|weg|allee|ring|kai|markt|zeile)[^\n]*)/i,
  ]);
}

function extractFixedTerm(lines: string[], text: string) {
  const explicit = findLabeledValue(lines, ["Befristet auf", "Befristung", "Befristet", "Unbefristet"]);
  const parsed = parseBooleanValue(explicit);
  if (parsed !== undefined) return parsed;

  if (/\bunbefristet\b/i.test(text)) return false;
  if (/\bbefristet\s+auf\b|\bbefristeter\s+mietvertrag\b/i.test(text)) return true;

  return undefined;
}
