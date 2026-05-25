import type { CalculationReport } from "@/types/case";

export function renderCalculationReportSections(report: CalculationReport) {
  return report.sections.map((section) => ({
    title: section.title,
    entries: section.entries.map((entry) => ({
      label: entry.label,
      value: entry.formattedValue ?? String(entry.value ?? "Fehlt"),
      source: entry.source,
      warning: entry.warning,
      overridden: entry.overridden,
    })),
  }));
}

export function renderCalculationReportAsText(report: CalculationReport) {
  const lines = [
    "Berechnungsbericht",
    `Erstellt: ${formatReportDate(report.generatedAt)}`,
    report.generatedBy ? `Erstellt von: ${report.generatedBy}` : "",
    "",
  ].filter(Boolean);

  for (const section of renderCalculationReportSections(report)) {
    lines.push(section.title);
    for (const entry of section.entries) {
      const suffix = [entry.overridden ? "Manuell angepasst" : undefined, entry.source && !entry.overridden ? `Quelle: ${entry.source}` : undefined, entry.warning].filter(Boolean).join(" | ");
      lines.push(`- ${entry.label}: ${entry.value}${suffix ? ` (${suffix})` : ""}`);
    }
    lines.push("");
  }

  if (report.warnings?.length) {
    lines.push("Warnungen");
    report.warnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  return lines.join("\n");
}

export function renderCalculationReportAsHtml(report: CalculationReport) {
  const sections = renderCalculationReportSections(report);
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Berechnungsbericht</title>
  <style>
    body { margin: 0; background: #fff; color: #111827; font-family: Arial, sans-serif; }
    main { max-width: 920px; margin: 0 auto; padding: 32px; }
    h1 { margin: 0 0 6px; font-size: 26px; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
    section { break-inside: avoid; border: 1px solid #d8dee9; border-radius: 8px; margin: 0 0 16px; padding: 16px; }
    h2 { margin: 0 0 12px; font-size: 16px; }
    .entry { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; border-top: 1px solid #e5e7eb; padding: 10px 0; }
    .entry:first-of-type { border-top: 0; }
    .label { font-weight: 700; }
    .value { font-weight: 700; text-align: right; }
    .source { color: #64748b; font-size: 12px; margin-top: 3px; }
    .warning { color: #92400e; font-weight: 700; }
    .override { color: #1d4ed8; font-weight: 700; }
    .warnings { border-color: #f59e0b; background: #fffbeb; }
    @media print { main { padding: 18mm; } section { break-inside: avoid; } button { display: none; } }
  </style>
</head>
<body>
  <main>
    <h1>Berechnungsbericht</h1>
    <div class="meta">Erstellt: ${escapeHtml(formatReportDate(report.generatedAt))}${report.generatedBy ? ` · Erstellt von: ${escapeHtml(report.generatedBy)}` : ""}</div>
    ${sections.map((section) => renderSection(section.title, section.entries)).join("")}
  </main>
</body>
</html>`;
}

function renderSection(title: string, entries: ReturnType<typeof renderCalculationReportSections>[number]["entries"]) {
  const isWarnings = title.toLowerCase().includes("warn");
  return `<section${isWarnings ? ' class="warnings"' : ""}>
    <h2>${escapeHtml(title)}</h2>
    ${entries.map((entry) => `<div class="entry">
      <div>
        <div class="label">${escapeHtml(entry.label)}</div>
        ${entry.source ? `<div class="source ${entry.overridden ? "override" : ""}">${escapeHtml(entry.overridden ? "Manuell angepasst" : entry.source)}</div>` : ""}
        ${entry.warning ? `<div class="source warning">${escapeHtml(entry.warning)}</div>` : ""}
      </div>
      <div class="value">${escapeHtml(entry.value)}</div>
    </div>`).join("")}
  </section>`;
}

function formatReportDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
