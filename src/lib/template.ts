import type { CaseRecord } from "@/types/case";
import { buildLetterTemplateData, getLetterPlaceholderCatalog, type LetterTemplateData } from "@/lib/letters/letter-data";

export const placeholders = getLetterPlaceholderCatalog().map((entry) => entry.placeholder);

export type TemplateValues = LetterTemplateData;

export const defaultTemplate = `An
{{empfaenger_name}}
{{empfaenger_adresse}}
{{empfaenger_plz_ort}}

Wien, {{datum}}

Betreff: {{betreff}}

Mieter: {{mieter_name}}
Wohnungsadresse: {{wohnungsadresse}}
Antragsgegner: {{antragsgegner}}
Vertretung: {{vertretung}}

Sehr geehrte Damen und Herren,

{{einleitung_text}}

Berechnungsgrundlage
{{berechnungsgrundlage_text}}

Forderungsaufstellung
{{forderungsaufstellung_text}}

Vergleichsvorschlag
{{vergleichsvorschlag_text}}

Zukuenftiger Mietzins
{{zukuenftiger_mietzins_text}}

Anlagen
{{anlagenliste}}
{{berechnungsbericht_hinweis}}

Pruefungsvorbehalt
{{pruefungsvorbehalt_text}}

Wir ersuchen um Rueckmeldung binnen {{frist_tage}} Tagen.

Bankverbindung:
{{bank_name}}
IBAN: {{iban}}
BIC: {{bic}}

Mit freundlichen Gruessen

{{geschaeftsfuehrer}}
Geschaeftsfuehrer
{{firma_name}}`;

export function createTemplateValues(record: CaseRecord): TemplateValues {
  return buildLetterTemplateData(record);
}

export function renderTemplateFromValues(template: string, values: TemplateValues) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(key, value), template);
}

export function renderTemplate(template: string, record: CaseRecord) {
  return renderTemplateFromValues(template, createTemplateValues(record));
}
