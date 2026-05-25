import type { ExtractedData } from "@/types/case";

const forbiddenMockValues = [
  ["Mag. Sabine", " Hofer"].join(""),
  ["Sabine", " Hofer"].join(""),
  ["Neubaugasse", " 24/8"].join(""),
  ["1070", " Wien"].join(""),
  ["Alpenstadt Hausverwaltung", " GmbH"].join(""),
  ["MAWA Immobilienverwaltung", " GmbH"].join(""),
  ["Favoritenstrasse", " 89/12"].join(""),
  ["1100", " Wien"].join(""),
] as const;

export type RecipientMapping = {
  recipientName: string;
  recipientAddress: string;
  recipientPostalCity: string;
  landlordName: string;
  landlordAddress: string;
  landlordPostalCity: string;
};

export function deriveRecipientMapping(extracted: ExtractedData): RecipientMapping {
  const safeExtracted = sanitizeExtractedData(extracted);
  const landlordName = clean(safeExtracted.landlord);
  const landlordAddress = clean(safeExtracted.landlordAddress);
  const landlordPostalCity = clean(safeExtracted.landlordPostalCity);
  const opposingParty = clean(safeExtracted.opposingParty);

  if (landlordName) {
    return {
      recipientName: landlordName,
      recipientAddress: landlordAddress,
      recipientPostalCity: landlordPostalCity,
      landlordName,
      landlordAddress,
      landlordPostalCity,
    };
  }

  if (opposingParty) {
    return {
      recipientName: opposingParty,
      recipientAddress: "",
      recipientPostalCity: "",
      landlordName,
      landlordAddress,
      landlordPostalCity,
    };
  }

  return {
    recipientName: "",
    recipientAddress: "",
    recipientPostalCity: "",
    landlordName,
    landlordAddress,
    landlordPostalCity,
  };
}

export function sanitizeExtractedData(extracted: ExtractedData): ExtractedData {
  const sanitized = { ...extracted };

  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value !== "string") continue;
    if (!containsForbiddenMockValue(value)) continue;

    console.warn(`Verbotener Mock-Wert in aktuellen Falldaten entfernt: ${key}`);
    (sanitized as Record<string, unknown>)[key] = "";
  }

  return sanitized;
}

function containsForbiddenMockValue(value: string) {
  return forbiddenMockValues.some((forbiddenValue) => value.includes(forbiddenValue));
}

function clean(value: string) {
  return value.trim();
}
