import type { AnalyticsReport } from "@/lib/analytics/analytics-report";

export function renderAnalyticsSections(report: AnalyticsReport) {
  return report.sections.map((section) => ({
    id: section.id,
    title: section.title,
    entries: section.entries.map((entry) => ({
      label: entry.label,
      value: entry.formattedValue ?? String(entry.value ?? ""),
      warning: entry.warning,
    })),
  }));
}

export function renderAnalyticsReportAsText(report: AnalyticsReport) {
  const lines = [
    "MAWA Management-Report",
    `Zeitraum: ${report.range}`,
    `Erstellt: ${formatDate(report.generatedAt)}`,
    "",
    "Zusammenfassung",
    `- Gesamtfälle: ${report.summary.totalCases}`,
    `- Aktive Fälle: ${report.summary.activeCases}`,
    `- Gesamtforderung: ${formatMoney(report.summary.totalClaimAmount)}`,
    `- Vergleichsbeträge: ${formatMoney(report.summary.totalSettlementAmount)}`,
    `- Überfällige Aufgaben: ${report.summary.overdueTasks}`,
    `- Versendete Schreiben: ${report.summary.sentLetters}`,
    `- Versendete Nachrichten: ${report.summary.sentMessages}`,
    "",
  ];

  for (const section of renderAnalyticsSections(report)) {
    lines.push(section.title);
    for (const entry of section.entries) {
      lines.push(`- ${entry.label}: ${entry.value}${entry.warning ? " [Warnung]" : ""}`);
    }
    lines.push("");
  }

  if (report.warnings?.length) {
    lines.push("Warnungen");
    report.warnings.forEach((warning) => lines.push(`- ${warning}`));
    lines.push("");
  }

  if (report.charts?.length) {
    lines.push("Chart-Daten");
    report.charts.forEach((chart) => lines.push(`- ${chart.title}: ${chart.type}`));
  }

  return lines.join("\n");
}

export function renderAnalyticsReportAsHtml(report: AnalyticsReport) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>MAWA Management-Report</title>
  <style>
    body { margin: 0; background: #ffffff; color: #111827; font-family: Arial, sans-serif; }
    main { max-width: 980px; margin: 0 auto; padding: 32px; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    h2 { margin: 0 0 12px; font-size: 17px; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 22px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
    .tile { border: 1px solid #d8dee9; border-radius: 8px; padding: 12px; }
    .tile-label { color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .tile-value { margin-top: 5px; font-size: 18px; font-weight: 800; }
    section { break-inside: avoid; border: 1px solid #d8dee9; border-radius: 8px; margin: 0 0 16px; padding: 16px; }
    .entry { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; border-top: 1px solid #e5e7eb; padding: 9px 0; }
    .entry:first-of-type { border-top: 0; }
    .label { font-weight: 700; }
    .value { font-weight: 800; text-align: right; }
    .warning { color: #92400e; }
    .warnings { border-color: #f59e0b; background: #fffbeb; }
    pre { white-space: pre-wrap; word-break: break-word; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc; font-size: 11px; }
    @media print {
      main { padding: 18mm; }
      section { break-inside: avoid; }
      .summary { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <main>
    <h1>MAWA Management-Report</h1>
    <div class="meta">Zeitraum: ${escapeHtml(report.range)} · Erstellt: ${escapeHtml(formatDate(report.generatedAt))}</div>
    ${renderSummary(report)}
    ${renderAnalyticsSections(report).map(renderSection).join("")}
    ${renderWarnings(report)}
    ${renderCharts(report)}
  </main>
</body>
</html>`;
}

function renderSummary(report: AnalyticsReport) {
  const items = [
    ["Gesamtfälle", report.summary.totalCases],
    ["Aktive Fälle", report.summary.activeCases],
    ["Gesamtforderung", formatMoney(report.summary.totalClaimAmount)],
    ["Vergleichsbeträge", formatMoney(report.summary.totalSettlementAmount)],
    ["Überfällige Aufgaben", report.summary.overdueTasks],
    ["Versendete Nachrichten", report.summary.sentMessages],
  ];

  return `<div class="summary">${items.map(([label, value]) => `<div class="tile"><div class="tile-label">${escapeHtml(String(label))}</div><div class="tile-value">${escapeHtml(String(value))}</div></div>`).join("")}</div>`;
}

function renderSection(section: ReturnType<typeof renderAnalyticsSections>[number]) {
  return `<section>
    <h2>${escapeHtml(section.title)}</h2>
    ${section.entries.map((entry) => `<div class="entry ${entry.warning ? "warning" : ""}">
      <div class="label">${escapeHtml(entry.label)}</div>
      <div class="value">${escapeHtml(entry.value)}</div>
    </div>`).join("")}
  </section>`;
}

function renderWarnings(report: AnalyticsReport) {
  if (!report.warnings?.length) return "";
  return `<section class="warnings"><h2>Warnungen</h2>${report.warnings.map((warning) => `<div class="entry warning"><div class="label">${escapeHtml(warning)}</div><div class="value">!</div></div>`).join("")}</section>`;
}

function renderCharts(report: AnalyticsReport) {
  if (!report.charts?.length) return "";
  return `<section><h2>Chart-Daten für Export-Pipeline</h2><pre>${escapeHtml(JSON.stringify(report.charts, null, 2))}</pre></section>`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
