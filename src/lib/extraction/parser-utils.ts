import { parseEuroValue as parseCalculationEuroValue } from "@/lib/calculation";

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
