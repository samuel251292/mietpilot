import { parseEuroValue as parseCalculationEuroValue } from "@/lib/calculation";
import type { PdfTextQuality } from "@/lib/extraction/types";

export type FindLabeledValueOptions = {
  maxLookahead?: number;
  stopLabels?: string[];
  requireValue?: (value: string) => boolean;
};

export function normalizeLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => cleanExtractedValue(line))
    .filter((line) => line && !ignoreNoiseLines(line));
}

export function findLabeledValue(lines: string[], labels: string[], options: FindLabeledValueOptions = {}) {
  const maxLookahead = options.maxLookahead ?? 2;
  const stopLabels = options.stopLabels ?? [];

  for (const label of labels) {
    const labelPattern = createLabelPattern(label);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const match = line.match(labelPattern);
      if (!match) continue;

      const inlineValue = cleanExtractedValue(match[1] ?? "");
      if (isAcceptableValue(inlineValue, options)) return inlineValue;

      for (let offset = 1; offset <= maxLookahead; offset += 1) {
        const nextLine = lines[index + offset];
        if (!nextLine || ignoreNoiseLines(nextLine)) continue;
        if (looksLikeAnyLabel(nextLine, [...labels, ...stopLabels])) break;
        if (looksLikeStandaloneLabel(nextLine)) break;
        if (isAcceptableValue(nextLine, options)) return cleanExtractedValue(nextLine);
      }
    }
  }

  return "";
}

export function parseEuroValue(value: unknown) {
  return parseCalculationEuroValue(value) ?? undefined;
}

export function assessPdfTextQuality(text: string): PdfTextQuality {
  const normalized = normalizePdfText(text);
  const textLength = normalized.length;
  const words = normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const letters = normalized.match(/\p{L}/gu) ?? [];
  const visibleCharacters = normalized.replace(/\s/g, "").length;
  const letterRatio = visibleCharacters === 0 ? 0 : roundRatio(letters.length / visibleCharacters);

  if (textLength === 0) {
    return { isUsable: false, reason: "Kein lesbarer PDF-Text erkannt.", textLength, wordCount: 0, letterRatio };
  }

  if (textLength < 100) {
    return { isUsable: false, reason: "PDF-Text ist zu kurz für eine verlässliche Auswertung.", textLength, wordCount: words.length, letterRatio };
  }

  if (words.length < 20) {
    return { isUsable: false, reason: "PDF-Text enthält zu wenige Wörter für eine verlässliche Auswertung.", textLength, wordCount: words.length, letterRatio };
  }

  if (letterRatio < 0.25) {
    return { isUsable: false, reason: "PDF-Text enthält auffällig wenige Buchstaben.", textLength, wordCount: words.length, letterRatio };
  }

  return { isUsable: true, textLength, wordCount: words.length, letterRatio };
}

export function normalizePdfText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function parseAreaValue(value = "") {
  const match = value.match(/\d+(?:[.,]\d+)?/);
  if (!match) return undefined;

  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseDateValue(value = "") {
  const match = value.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (!match) return "";

  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function parseBooleanValue(value = "") {
  const normalized = value.toLowerCase();

  if (/\bunbefristet\b|keine\s+befristung|\bnein\b|nicht\s+vorhanden|\bfalse\b/.test(normalized)) return false;
  if (/\bbefristet\b|\bja\b|vorhanden|\btrue\b|\bx\b|✓/.test(normalized)) return true;

  return undefined;
}

export function cleanExtractedValue(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/^[.:;\-\s]+|[.:;\-\s]+$/g, "")
    .trim();
}

export function ignoreNoiseLines(line: string) {
  return /^(Erreichbarkeit|Station|Linien|Seite|Bitte beachten Sie|.*Servicestellen|Informationen zum Richtwertmietzins)\b/i.test(line.trim());
}

export function compactExtraction<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== "" && value !== undefined && value !== null)) as Partial<T>;
}

export function missingIssues<T extends Record<string, unknown>>(data: Partial<T>, fields: Array<keyof T>) {
  return fields
    .filter((field) => data[field] === undefined || data[field] === "")
    .map((field) => ({ field: String(field), message: "Bitte prüfen" }));
}

export function isUsableAddressValue(value: string) {
  return Boolean(value) && !ignoreNoiseLines(value) && /\d/.test(value) && /straße|strasse|gasse|platz|weg|allee|ring|kai|markt|zeile|stiege|top|tür|tuer/i.test(value);
}

export function findByPatterns(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanExtractedValue(match?.[1] ?? "");
    if (value && !ignoreNoiseLines(value)) return value;
  }

  return "";
}

function createLabelPattern(label: string) {
  return new RegExp(`^\\s*${escapeRegExp(label)}\\s*(?:[:\\-–]|$)\\s*(.*)$`, "i");
}

function isAcceptableValue(value: string, options: FindLabeledValueOptions) {
  return Boolean(value) && !ignoreNoiseLines(value) && !looksLikeStandaloneLabel(value) && (options.requireValue ? options.requireValue(value) : true);
}

function looksLikeAnyLabel(value: string, labels: string[]) {
  return labels.some((label) => createLabelPattern(label).test(value));
}

function looksLikeStandaloneLabel(value: string) {
  return /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9/.,\s-]{1,55}:$/.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function roundRatio(value: number) {
  return Math.round(value * 1000) / 1000;
}
