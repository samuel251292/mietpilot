import type { DistributionPoint } from "@/lib/analytics/analytics-service";
import type { buildAnalyticsReport } from "@/lib/analytics/analytics-service";

export type AnalyticsReportData = ReturnType<typeof buildAnalyticsReport>;

export type AnalyticsReport = {
  generatedAt: string;
  range: string;
  summary: {
    totalCases: number;
    activeCases: number;
    totalClaimAmount: number;
    totalSettlementAmount: number;
    overdueTasks: number;
    sentLetters: number;
    sentMessages: number;
  };
  sections: Array<{
    id: string;
    title: string;
    entries: Array<{
      label: string;
      value: string | number;
      formattedValue?: string;
      warning?: boolean;
    }>;
  }>;
  charts?: Array<{
    id: string;
    title: string;
    type: string;
    data: unknown;
  }>;
  warnings?: string[];
};

export type AnalyticsReportOptions = {
  generatedAt?: string;
};

export function buildAnalyticsReportDocument(reportData: AnalyticsReportData, options: AnalyticsReportOptions = {}): AnalyticsReport {
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    range: reportData.dateRange.label,
    summary: buildAnalyticsManagementSummary(reportData),
    sections: [
      {
        id: "cases",
        title: "Fälle",
        entries: [
          entry("Gesamtfälle", reportData.cases.totalCases),
          entry("Neue Fälle", reportData.cases.newCases),
          entry("Aktive Fälle", reportData.cases.activeCases),
          entry("Abgeschlossene Fälle", reportData.cases.completedCases),
          entry("Gewonnen", reportData.cases.wonCases),
          entry("Verloren", reportData.cases.lostCases),
          entry("Conversion", reportData.cases.conversion, `${reportData.cases.conversion} %`, reportData.cases.completedCases > 0 && reportData.cases.conversion < 50),
        ],
      },
      {
        id: "financials",
        title: "Forderungen und Vergleichsbeträge",
        entries: [
          moneyEntry("Gesamtforderung", reportData.financials.totalClaim),
          moneyEntry("Offene Forderung", reportData.financials.openClaim),
          moneyEntry("Vergleichsbeträge", reportData.financials.settlementAmounts),
          moneyEntry("MAWA-Umsatz", reportData.financials.mawaRevenue),
          moneyEntry("Ø monatliche Überzahlung", reportData.financials.averageMonthlyOverpayment),
          moneyEntry("Ø Vergleichsbetrag", reportData.financials.averageSettlementAmount),
        ],
      },
      {
        id: "documents",
        title: "Dokumente und OCR",
        entries: [
          entry("Dokumente gesamt", reportData.documents.totalDocuments),
          entry("Erfolgreich analysiert", reportData.documents.successful),
          entry("OCR verwendet", reportData.documents.ocrUsed, undefined, reportData.documents.ocrUsed > 0),
          entry("OCR erforderlich", reportData.documents.ocrRequired, undefined, reportData.documents.ocrRequired > 0),
          entry("Fehlgeschlagen", reportData.documents.failed, undefined, reportData.documents.failed > 0),
          entry("Legacy-Dokumente", reportData.documents.legacy, undefined, reportData.documents.legacy > 0),
          entry("Ungeprüfte Änderungen", reportData.documents.pendingChanges, undefined, reportData.documents.pendingChanges > 0),
        ],
      },
      {
        id: "quality",
        title: "Dokumentenqualität und Review-Backlog",
        entries: [
          entry("OCR-Quote", reportData.quality.ocr.ocrRate, `${reportData.quality.ocr.ocrRate} %`, reportData.quality.ocr.ocrRequired > 0),
          entry("Extraktions-Erfolgsquote", reportData.quality.extraction.successRate, `${reportData.quality.extraction.successRate} %`, reportData.quality.extraction.failedExtractions > 0),
          entry("Fehlende Pflichtdokumente", reportData.quality.documents.missingRequiredDocuments, undefined, reportData.quality.documents.missingRequiredDocuments > 0),
          entry("Dokumente mit Warnungen", reportData.quality.documents.documentsWithWarnings, undefined, reportData.quality.documents.documentsWithWarnings > 0),
          entry("Fälle mit Qualitätsproblemen", reportData.quality.documents.casesWithQualityProblems, undefined, reportData.quality.documents.casesWithQualityProblems > 0),
          entry("Offene Reviews", reportData.quality.reviewBacklog.openReviews, undefined, reportData.quality.reviewBacklog.openReviews > 0),
          entry("Ungeprüfte Extraktionsänderungen", reportData.quality.reviewBacklog.pendingExtractionChanges, undefined, reportData.quality.reviewBacklog.pendingExtractionChanges > 0),
          entry("Nicht freigegebene Schreiben", reportData.quality.reviewBacklog.unapprovedLetters, undefined, reportData.quality.reviewBacklog.unapprovedLetters > 0),
          entry("Veraltete Schreiben", reportData.quality.reviewBacklog.outdatedLetters, undefined, reportData.quality.reviewBacklog.outdatedLetters > 0),
        ],
      },
      {
        id: "letters",
        title: "Schreiben",
        entries: [
          entry("Schreiben gesamt", reportData.letters.totalLetters),
          entry("Bereit", reportData.letters.ready),
          entry("In Prüfung", reportData.letters.review, undefined, reportData.letters.review > 0),
          entry("Freigegeben", reportData.letters.approved),
          entry("Versendet", reportData.letters.sent),
          entry("Archiviert", reportData.letters.archived),
          entry("Veraltet", reportData.letters.outdated, undefined, reportData.letters.outdated > 0),
          entry("Offene Reviews", reportData.letters.openReviews, undefined, reportData.letters.openReviews > 0),
        ],
      },
      {
        id: "communication",
        title: "Kommunikation",
        entries: [
          entry("Threads", reportData.communication.threads),
          entry("Nachrichten", reportData.communication.messages),
          entry("Drafts", reportData.communication.drafts),
          entry("Ready", reportData.communication.ready),
          entry("Sent", reportData.communication.sent),
          entry("Failed", reportData.communication.failed, undefined, reportData.communication.failed > 0),
          entry("Received", reportData.communication.received),
        ],
      },
      {
        id: "tasks-calendar",
        title: "Aufgaben und Kalender",
        entries: [
          entry("Offene Aufgaben", reportData.tasks.openTasks, undefined, reportData.tasks.openTasks > 20),
          entry("Überfällige Aufgaben", reportData.tasks.overdueTasks, undefined, reportData.tasks.overdueTasks > 0),
          entry("Erledigte Aufgaben", reportData.tasks.completedTasks),
          entry("Termine heute", reportData.calendar.appointmentsToday),
          entry("Termine diese Woche", reportData.calendar.appointmentsWeek),
          entry("Verhandlungen", reportData.calendar.hearings),
          entry("Besichtigungen", reportData.calendar.visits),
        ],
      },
      {
        id: "employees",
        title: "Mitarbeiter-Auslastung",
        entries: reportData.workload.slice(0, 8).flatMap((employee) => [
          entry(`${employee.name}: Fälle`, employee.cases),
          entry(`${employee.name}: offene Aufgaben`, employee.openTasks, undefined, employee.openTasks > 10),
          entry(`${employee.name}: überfällig`, employee.overdueTasks, undefined, employee.overdueTasks > 0),
          entry(`${employee.name}: Termine diese Woche`, employee.appointmentsThisWeek),
        ]),
      },
    ],
    charts: [
      { id: "monthly-cases", title: "Fälle pro Monat", type: "monthly-series", data: reportData.series.cases },
      { id: "monthly-financials", title: "Forderungen pro Monat", type: "monthly-series", data: reportData.series.financials },
      { id: "case-status", title: "Statusverteilung Fälle", type: "distribution", data: compactDistribution(reportData.distributions.cases) },
      { id: "documents", title: "Dokumentenqualität/OCR", type: "distribution", data: compactDistribution(reportData.distributions.documents) },
      { id: "quality-warnings", title: "Häufigste Qualitätswarnungen", type: "distribution", data: compactDistribution(reportData.quality.extraction.commonWarnings) },
      { id: "quality-risks", title: "Qualitätsrisiken", type: "risk-list", data: reportData.quality.documents.riskItems },
      { id: "letters", title: "Schreibenstatus", type: "distribution", data: compactDistribution(reportData.distributions.letters) },
      { id: "communication", title: "Kommunikationsstatus", type: "distribution", data: compactDistribution(reportData.distributions.communication) },
      { id: "task-priorities", title: "Aufgabenprioritäten", type: "distribution", data: compactDistribution(reportData.distributions.taskPriorities) },
      { id: "employee-workload", title: "Mitarbeiter-Auslastung", type: "workload", data: reportData.workload },
    ],
    warnings: buildAnalyticsWarnings(reportData),
  };
}

export function buildAnalyticsManagementSummary(reportData: AnalyticsReportData): AnalyticsReport["summary"] {
  return {
    totalCases: reportData.cases.totalCases,
    activeCases: reportData.cases.activeCases,
    totalClaimAmount: reportData.financials.totalClaim,
    totalSettlementAmount: reportData.financials.settlementAmounts,
    overdueTasks: reportData.tasks.overdueTasks,
    sentLetters: reportData.letters.sent,
    sentMessages: reportData.communication.sent,
  };
}

export function buildAnalyticsWarnings(reportData: AnalyticsReportData) {
  const warnings: string[] = [];
  if (reportData.documents.ocrRequired > 0) warnings.push(`${reportData.documents.ocrRequired} Dokument(e) benötigen OCR oder manuelle Prüfung.`);
  if (reportData.documents.failed > 0) warnings.push(`${reportData.documents.failed} Dokument(e) haben eine fehlgeschlagene Extraktion.`);
  if (reportData.documents.pendingChanges > 0) warnings.push(`${reportData.documents.pendingChanges} ungeprüfte erkannte Änderung(en) vorhanden.`);
  if (reportData.quality.documents.missingRequiredDocuments > 0) warnings.push(`${reportData.quality.documents.missingRequiredDocuments} Pflichtdokument(e) fehlen.`);
  if (reportData.quality.documents.casesWithQualityProblems > 0) warnings.push(`${reportData.quality.documents.casesWithQualityProblems} Fall/Fälle haben Qualitätsprobleme.`);
  if (reportData.letters.openReviews > 0) warnings.push(`${reportData.letters.openReviews} Schreiben benötigen Review.`);
  if (reportData.letters.outdated > 0) warnings.push(`${reportData.letters.outdated} Schreiben sind veraltet.`);
  if (reportData.communication.failed > 0) warnings.push(`${reportData.communication.failed} Kommunikationseintrag/Einträge sind fehlgeschlagen.`);
  if (reportData.tasks.overdueTasks > 0) warnings.push(`${reportData.tasks.overdueTasks} Aufgabe(n) sind überfällig.`);
  return warnings;
}

function compactDistribution(data: DistributionPoint[]) {
  return data.filter((point) => point.value > 0);
}

function entry(label: string, value: string | number, formattedValue?: string, warning = false) {
  return { label, value, formattedValue, warning };
}

function moneyEntry(label: string, value: number, warning = false) {
  return entry(label, value, formatMoney(value), warning);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(value);
}
