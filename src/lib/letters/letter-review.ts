import type { LetterAttachment, LetterReview, LetterReviewStatus, SavedCaseRecord } from "@/types/case";
import type { LetterTemplateData } from "@/lib/letters/letter-data";

const criticalFields: Array<{ key: string; label: string }> = [
  ["{{empfaenger_name}}", "Empfänger"],
  ["{{wohnungsadresse}}", "Wohnungsadresse"],
  ["{{mieter_name}}", "Mieter"],
  ["{{aktuelle_miete}}", "Aktuelle Miete"],
  ["{{erlaubte_miete}}", "Erlaubte Miete"],
  ["{{vergleichsbetrag}}", "Vergleichsbetrag"],
].map(([key, label]) => ({ key, label }));

export function analyzeLetterTemplateData(templateData: LetterTemplateData) {
  const missingFields = detectMissingLetterFields(templateData);
  const warnings = [
    ...valueWarning(templateData["{{berechnungs_warnungen}}"], "Berechnungswarnungen vorhanden."),
    ...valueWarning(templateData["{{ocr_hinweise}}"], "OCR-Hinweise vorhanden."),
    ...valueWarning(templateData["{{ungepruefte_aenderungen}}"], "Ungeprüfte erkannte Änderungen vorhanden."),
    ...valueWarning(templateData["{{manuelle_anpassungen}}"], "Manuelle Anpassungen vorhanden."),
  ];

  return { missingFields, warnings };
}

export function detectMissingLetterFields(templateData: LetterTemplateData) {
  return criticalFields
    .filter(({ key }) => !isFilled(templateData[key]))
    .map(({ label }) => label);
}

export function detectUnresolvedPlaceholders(text: string) {
  const matches = text.match(/\{\{\s*[\w_]+\s*\}\}/g) ?? [];
  return Array.from(new Set(matches.map((match) => match.replace(/\s+/g, "")))).sort((a, b) => a.localeCompare(b));
}

export function buildLetterReview(caseRecord: Partial<SavedCaseRecord>, templateData: LetterTemplateData, text: string): LetterReview {
  const analysis = analyzeLetterTemplateData(templateData);
  const unresolvedPlaceholders = detectUnresolvedPlaceholders(text);
  const attachments = caseRecord.letterAttachments ?? [];
  const warnings = [...analysis.warnings];
  const missingFields = [...analysis.missingFields];
  const hasCalculationReportReference = text.includes("Berechnungsaufstellung") || text.includes("{{berechnungsbericht_hinweis}}");

  if (attachments.length === 0) warnings.push("Keine Anlagen erkannt.");
  if (!hasAttachmentType(attachments, "mietvertrag")) warnings.push("Mietvertrag nicht als Anlage erkannt.");
  if (!hasAttachmentType(attachments, "datenblatt")) warnings.push("Datenblatt nicht als Anlage erkannt.");
  if (!hasAttachmentType(attachments, "richtwert")) warnings.push("Richtwert nicht als Anlage erkannt.");
  if (hasCalculationReportReference && !hasAttachmentType(attachments, "berechnungsbericht")) warnings.push("Berechnungsbericht wird erwähnt, ist aber nicht als Anlage erkannt.");
  if (unresolvedPlaceholders.length > 0) warnings.push("Das Schreiben enthält nicht ersetzte Platzhalter.");

  return {
    status: getLetterReviewStatus({ warnings, missingFields, unresolvedPlaceholders }),
    warnings: unique(warnings),
    missingFields: unique(missingFields),
    unresolvedPlaceholders,
    metadata: {
      attachmentCount: attachments.length,
      analyzedAt: new Date().toISOString(),
    },
  };
}

export function getLetterReviewStatus(review: Pick<LetterReview, "warnings" | "missingFields" | "unresolvedPlaceholders" | "status">): LetterReviewStatus {
  if (review.status === "approved") return "approved";
  if ((review.missingFields ?? []).length > 0 || (review.unresolvedPlaceholders ?? []).length > 0) return "review_required";
  if ((review.warnings ?? []).length > 0) return "warning";
  return "ready";
}

function hasAttachmentType(attachments: LetterAttachment[], type: LetterAttachment["type"]) {
  return attachments.some((attachment) => attachment.type === type && attachment.includedInLetter !== false);
}

function isFilled(value: unknown) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized && normalized !== "0" && normalized !== "0,00 €" && normalized !== "€ 0,00");
}

function valueWarning(value: unknown, warning: string) {
  return String(value ?? "").trim() ? [warning] : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
