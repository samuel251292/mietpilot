"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, BarChart3, BriefcaseBusiness, CalendarDays, FileText, Mail, PieChart, Search, Users } from "lucide-react";
import {
  buildAnalyticsReport,
  type AnalyticsRange,
  type DocumentRiskItem,
  type DistributionPoint,
  type EmployeeAnalyticsRow,
  type EmployeeQualityRow,
  type EmployeePerformanceRow,
  type EmployeeWorkloadPoint,
  type MonthlyCaseSeriesPoint,
  type MonthlyFinancialSeriesPoint,
} from "@/lib/analytics/analytics-service";
import { buildAnalyticsReportDocument, type AnalyticsReport } from "@/lib/analytics/analytics-report";
import { renderAnalyticsReportAsHtml, renderAnalyticsReportAsText } from "@/lib/analytics/analytics-report-renderer";
import { visibleCases } from "@/lib/auth";
import { CaseService, CaseServiceAsync } from "@/lib/case-service";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/use-auth";
import { downloadBlob } from "@/lib/word-templates";
import type { SavedCaseRecord } from "@/types/case";

const rangeOptions: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "last30", label: "30 Tage" },
  { value: "last90", label: "90 Tage" },
  { value: "year", label: "Jahr" },
];

export default function AnalyticsPage() {
  const { user, loaded } = useAuth();
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [range, setRange] = useState<AnalyticsRange>("all");
  const [previewReport, setPreviewReport] = useState<AnalyticsReport | null>(null);
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const asyncRecords = await CaseServiceAsync.list();
        if (!cancelled) setRecords(asyncRecords);
      } catch (error) {
        console.warn("Async-Analyticsdaten konnten nicht geladen werden. LocalStorage-Fallback wird genutzt.", error);
        const fallbackRecords = CaseService.list();
        if (!cancelled) {
          setRecords(fallbackRecords);
          setLoadError("Analyticsdaten konnten nicht aus dem vorbereiteten Online-Repository geladen werden. Lokale Daten werden angezeigt.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    window.addEventListener("mietpilot-cases-changed", load);
    window.addEventListener("storage", load);
    return () => {
      cancelled = true;
      window.removeEventListener("mietpilot-cases-changed", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const scopeRecords = useMemo(() => visibleCases(user, records), [records, user]);
  const report = useMemo(() => buildAnalyticsReport(scopeRecords, { range }), [range, scopeRecords]);
  const reportDocument = useMemo(() => buildAnalyticsReportDocument(report), [report]);
  const performanceRows = useMemo(() => getVisiblePerformanceRows(report.performance, user), [report.performance, user]);

  function showReport() {
    setPreviewReport(reportDocument);
  }

  function printReport() {
    openPrintableReport(reportDocument);
  }

  function prepareDocx() {
    const html = renderAnalyticsReportAsHtml(reportDocument);
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), createReportFileName("docx-vorbereitung", "html"));
    setExportMessage("DOCX-Vorbereitung erstellt: strukturierter HTML-Report wurde heruntergeladen.");
  }

  function preparePdf() {
    const html = renderAnalyticsReportAsHtml(reportDocument);
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), createReportFileName("pdf-vorbereitung", "html"));
    setExportMessage("PDF-Vorbereitung erstellt: druckbarer HTML-Report wurde heruntergeladen.");
  }

  if (!loaded) return null;

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-blue-300">MAWA Reporting</div>
            <h1 className="mt-1 text-2xl font-extrabold text-white">Analytics</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              Echte Auswertung aus sichtbaren Fällen, Berechnungen, Dokumenten, Schreiben, Kommunikation, Aufgaben und Terminen.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap justify-end gap-2 rounded-lg border border-slate-800 bg-slate-900/80 p-1.5">
              {rangeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  className={
                    range === option.value
                      ? "rounded-md bg-blue-600 px-3 py-2 text-xs font-extrabold text-white"
                      : "rounded-md px-3 py-2 text-xs font-extrabold text-slate-400 hover:bg-slate-800 hover:text-white"
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            {scopeRecords.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
                <ReportButton onClick={showReport}>Bericht anzeigen</ReportButton>
                <ReportButton onClick={printReport}>Bericht drucken</ReportButton>
                <ReportButton onClick={prepareDocx}>Bericht als DOCX vorbereiten</ReportButton>
                <ReportButton onClick={preparePdf}>Bericht als PDF vorbereiten</ReportButton>
              </div>
            )}
          </div>
        </header>

        {loading && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
            Analyticsdaten werden geladen ...
          </div>
        )}
        {loadError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {loadError}
          </div>
        )}

        {scopeRecords.length === 0 ? (
          <AnalyticsEmptyState />
        ) : (
          <>
            {exportMessage && <div className="rounded-md border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-100">{exportMessage}</div>}
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard title="Fälle gesamt" value={report.cases.totalCases} note={`${report.cases.newCases} neu heute`} icon={<BriefcaseBusiness size={19} />} tone="blue" />
              <KpiCard title="Gesamtforderung" value={formatCurrency(report.financials.totalClaim)} note="Summe sichtbarer Forderungen" icon={<BarChart3 size={19} />} tone="green" />
              <KpiCard title="Conversion" value={`${report.cases.conversion} %`} note={`${report.cases.wonCases} gewonnen / ${report.cases.lostCases} verloren`} icon={<PieChart size={19} />} tone="violet" />
              <KpiCard title="MAWA-Umsatz" value={formatCurrency(report.financials.mawaRevenue)} note="MVP-Regel aus Dashboard" icon={<Search size={19} />} tone="amber" />
            </section>

            <AnalyticsSection title="Übersicht" icon={<BriefcaseBusiness size={18} />}>
              <MetricGrid
                items={[
                  ["Gesamtfälle", report.cases.totalCases],
                  ["Neue Fälle", report.cases.newCases],
                  ["Aktive Fälle", report.cases.activeCases],
                  ["Abgeschlossen", report.cases.completedCases],
                  ["Gewonnen", report.cases.wonCases],
                  ["Verloren", report.cases.lostCases],
                ]}
              />
            </AnalyticsSection>

            <section className="grid gap-5 xl:grid-cols-2">
              <AnalyticsSection title="Fälle pro Monat" icon={<BarChart3 size={18} />}>
                <MonthlyCaseChart data={report.series.cases} />
              </AnalyticsSection>
              <AnalyticsSection title="Forderungen pro Monat" icon={<BarChart3 size={18} />}>
                <MonthlyFinancialChart data={report.series.financials} />
              </AnalyticsSection>
            </section>

            <AnalyticsSection title="Forderungen" icon={<BarChart3 size={18} />}>
              <MetricGrid
                items={[
                  ["Gesamtforderung", formatCurrency(report.financials.totalClaim)],
                  ["Offene Forderung", formatCurrency(report.financials.openClaim)],
                  ["Vergleichsbeträge", formatCurrency(report.financials.settlementAmounts)],
                  ["MAWA-Umsatz", formatCurrency(report.financials.mawaRevenue)],
                  ["Ø monatliche Überzahlung", formatCurrency(report.financials.averageMonthlyOverpayment)],
                  ["Ø Vergleichsbetrag", formatCurrency(report.financials.averageSettlementAmount)],
                ]}
              />
            </AnalyticsSection>

            <section className="grid gap-5 xl:grid-cols-2">
              <AnalyticsSection title="Statusverteilung Fälle" icon={<PieChart size={18} />}>
                <DistributionBars data={report.distributions.cases} />
              </AnalyticsSection>
              <AnalyticsSection title="Dokumentenqualität/OCR" icon={<FileText size={18} />}>
                <DistributionBars data={report.distributions.documents} />
              </AnalyticsSection>
            </section>

            <AnalyticsSection title="Dokumente/OCR" icon={<FileText size={18} />}>
              <MetricGrid
                items={[
                  ["Dokumente gesamt", report.documents.totalDocuments],
                  ["Erfolgreich analysiert", report.documents.successful],
                  ["OCR verwendet", report.documents.ocrUsed],
                  ["OCR erforderlich", report.documents.ocrRequired],
                  ["Fehlgeschlagen", report.documents.failed],
                  ["Legacy-Dokumente", report.documents.legacy],
                  ["Ungeprüfte Änderungen", report.documents.pendingChanges],
                ]}
              />
            </AnalyticsSection>

            <AnalyticsSection title="Dokumente & Qualität" icon={<AlertTriangle size={18} />}>
              <DocumentQualityAnalyticsPanel
                documentQuality={report.quality.documents}
                extraction={report.quality.extraction}
                reviewBacklog={report.quality.reviewBacklog}
                ocr={report.quality.ocr}
              />
            </AnalyticsSection>

            <section className="grid gap-5 xl:grid-cols-3">
              <AnalyticsSection title="Schreibenstatus" icon={<FileText size={18} />}>
                <DistributionBars data={report.distributions.letters} compact />
              </AnalyticsSection>
              <AnalyticsSection title="Kommunikationsstatus" icon={<Mail size={18} />}>
                <DistributionBars data={report.distributions.communication} compact />
              </AnalyticsSection>
              <AnalyticsSection title="Aufgabenprioritäten" icon={<CalendarDays size={18} />}>
                <DistributionBars data={report.distributions.taskPriorities} compact />
              </AnalyticsSection>
            </section>

            <AnalyticsSection title="Schreiben" icon={<FileText size={18} />}>
              <MetricGrid
                items={[
                  ["Schreiben gesamt", report.letters.totalLetters],
                  ["Bereit", report.letters.ready],
                  ["In Prüfung", report.letters.review],
                  ["Freigegeben", report.letters.approved],
                  ["Versendet", report.letters.sent],
                  ["Archiviert", report.letters.archived],
                  ["Veraltet", report.letters.outdated],
                  ["Offene Reviews", report.letters.openReviews],
                ]}
              />
            </AnalyticsSection>

            <AnalyticsSection title="Kommunikation" icon={<Mail size={18} />}>
              <MetricGrid
                items={[
                  ["Threads", report.communication.threads],
                  ["Nachrichten", report.communication.messages],
                  ["Drafts", report.communication.drafts],
                  ["Ready", report.communication.ready],
                  ["Sent", report.communication.sent],
                  ["Failed", report.communication.failed],
                  ["Received", report.communication.received],
                ]}
              />
            </AnalyticsSection>

            <AnalyticsSection title="Aufgaben/Kalender" icon={<CalendarDays size={18} />}>
              <MetricGrid
                items={[
                  ["Offene Aufgaben", report.tasks.openTasks],
                  ["Überfällige Aufgaben", report.tasks.overdueTasks],
                  ["Erledigte Aufgaben", report.tasks.completedTasks],
                  ["Termine heute", report.calendar.appointmentsToday],
                  ["Termine diese Woche", report.calendar.appointmentsWeek],
                  ["Verhandlungen", report.calendar.hearings],
                  ["Besichtigungen", report.calendar.visits],
                ]}
              />
            </AnalyticsSection>

            <AnalyticsSection title="Mitarbeiter" icon={<Users size={18} />}>
              <EmployeeRows rows={report.employees} />
            </AnalyticsSection>

            <AnalyticsSection title="Mitarbeiter-Auslastung" icon={<Users size={18} />}>
              <EmployeeWorkloadChart rows={report.workload} />
            </AnalyticsSection>

            <AnalyticsSection title="Mitarbeiter & Performance" icon={<Users size={18} />}>
              <EmployeePerformanceAnalytics rows={performanceRows} isAdmin={user?.role === "admin"} />
            </AnalyticsSection>
          </>
        )}
        {previewReport && <AnalyticsReportPreview report={previewReport} onClose={() => setPreviewReport(null)} />}
      </div>
    </div>
  );
}

function MonthlyCaseChart({ data }: { data: MonthlyCaseSeriesPoint[] }) {
  const hasData = data.some((item) => item.newCases || item.completedCases || item.sentLetters || item.sentMessages);
  if (!hasData) return <ChartEmptyState />;
  const max = Math.max(...data.flatMap((item) => [item.newCases, item.completedCases, item.sentLetters, item.sentMessages]), 1);

  return (
    <div className="space-y-4">
      <ChartLegend items={[["Neue Fälle", "bg-blue-400"], ["Abgeschlossen", "bg-emerald-400"], ["Schreiben versendet", "bg-violet-400"], ["Nachrichten versendet", "bg-amber-400"]]} />
      <div className="grid min-h-[190px] grid-cols-[repeat(auto-fit,minmax(62px,1fr))] items-end gap-3">
        {data.map((item) => (
          <div key={item.month} className="space-y-2">
            <div className="flex h-36 items-end gap-1 rounded-md border border-slate-800 bg-slate-950/50 px-2 py-2">
              <MiniBar value={item.newCases} max={max} className="bg-blue-400" />
              <MiniBar value={item.completedCases} max={max} className="bg-emerald-400" />
              <MiniBar value={item.sentLetters} max={max} className="bg-violet-400" />
              <MiniBar value={item.sentMessages} max={max} className="bg-amber-400" />
            </div>
            <div className="truncate text-center text-xs font-bold text-slate-400">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyFinancialChart({ data }: { data: MonthlyFinancialSeriesPoint[] }) {
  const hasData = data.some((item) => item.totalClaim || item.settlementAmounts);
  if (!hasData) return <ChartEmptyState />;
  const max = Math.max(...data.flatMap((item) => [item.totalClaim, item.settlementAmounts]), 1);

  return (
    <div className="space-y-4">
      <ChartLegend items={[["Gesamtforderung", "bg-emerald-400"], ["Vergleichsbeträge", "bg-blue-400"]]} />
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.month} className="grid gap-2 sm:grid-cols-[84px_1fr] sm:items-center">
            <div className="text-xs font-extrabold text-slate-400">{item.label}</div>
            <div className="space-y-1.5">
              <HorizontalBar label="Gesamtforderung" value={item.totalClaim} max={max} className="bg-emerald-400" formatter={formatCurrency} />
              <HorizontalBar label="Vergleich" value={item.settlementAmounts} max={max} className="bg-blue-400" formatter={formatCurrency} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistributionBars({ data, compact = false }: { data: DistributionPoint[]; compact?: boolean }) {
  const visible = data.filter((item) => item.value > 0);
  if (visible.length === 0) return <ChartEmptyState />;
  const max = Math.max(...visible.map((item) => item.value), 1);

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {visible.map((item) => (
        <div key={item.key} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-bold text-slate-300">{item.label}</span>
            <span className="font-extrabold text-white">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.max((item.value / max) * 100, 3)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmployeeWorkloadChart({ rows }: { rows: EmployeeWorkloadPoint[] }) {
  const visible = rows.filter((row) => row.cases || row.openTasks || row.overdueTasks || row.appointmentsThisWeek || row.letters || row.communication);
  if (visible.length === 0) return <ChartEmptyState />;
  const max = Math.max(...visible.flatMap((row) => [row.cases, row.openTasks, row.overdueTasks, row.appointmentsThisWeek, row.letters, row.communication]), 1);

  return (
    <div className="space-y-4">
      <ChartLegend items={[["Fälle", "bg-blue-400"], ["Offene Aufgaben", "bg-amber-400"], ["Überfällig", "bg-red-400"], ["Termine Woche", "bg-emerald-400"], ["Schreiben", "bg-violet-400"], ["Kommunikation", "bg-slate-300"]]} />
      <div className="space-y-4">
        {visible.map((row) => (
          <div key={row.id} className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-extrabold text-white">{row.name}</div>
              <div className="text-xs font-bold text-slate-500">{row.activeCases} aktive Fälle</div>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <HorizontalBar label="Fälle" value={row.cases} max={max} className="bg-blue-400" />
              <HorizontalBar label="Offene Aufgaben" value={row.openTasks} max={max} className="bg-amber-400" />
              <HorizontalBar label="Überfällig" value={row.overdueTasks} max={max} className="bg-red-400" />
              <HorizontalBar label="Termine Woche" value={row.appointmentsThisWeek} max={max} className="bg-emerald-400" />
              <HorizontalBar label="Schreiben" value={row.letters} max={max} className="bg-violet-400" />
              <HorizontalBar label="Kommunikation" value={row.communication} max={max} className="bg-slate-300" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmployeePerformanceAnalytics({ rows, isAdmin }: { rows: EmployeePerformanceRow[]; isAdmin: boolean }) {
  if (rows.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-700 bg-slate-950/50 p-6 text-sm font-semibold text-slate-400">Noch keine Mitarbeiterdaten vorhanden.</div>;
  }

  const totals = rows.reduce(
    (sum, row) => ({
      activeCases: sum.activeCases + row.activeCases,
      openTasks: sum.openTasks + row.openTasks,
      overdueTasks: sum.overdueTasks + row.overdueTasks,
      appointmentsThisWeek: sum.appointmentsThisWeek + row.appointmentsThisWeek,
      sentLetters: sum.sentLetters + row.sentLetters,
      sentMessages: sum.sentMessages + row.sentMessages,
      totalClaimAmount: sum.totalClaimAmount + row.totalClaimAmount,
    }),
    { activeCases: 0, openTasks: 0, overdueTasks: 0, appointmentsThisWeek: 0, sentLetters: 0, sentMessages: 0, totalClaimAmount: 0 },
  );
  const maxLoad = Math.max(...rows.flatMap((row) => [row.activeCases, row.openTasks, row.overdueTasks, row.appointmentsThisWeek, row.lettersTotal, row.messagesTotal]), 1);

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="rounded-md border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">
          Mitarbeiteransicht: Eigene Performance wird vollständig angezeigt, andere sichtbare Zuständigkeiten werden zusammengefasst.
        </div>
      )}
      <MetricGrid
        items={[
          ["Aktive Fälle", totals.activeCases],
          ["Offene Aufgaben", totals.openTasks],
          ["Überfällig", totals.overdueTasks],
          ["Termine diese Woche", totals.appointmentsThisWeek],
          ["Versendete Schreiben", totals.sentLetters],
          ["Versendete Nachrichten", totals.sentMessages],
          ["Gesamtforderung", formatCurrency(totals.totalClaimAmount)],
        ]}
      />
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-md border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-extrabold text-white">{row.name}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  Letzte Aktivität: {formatDateTime(row.lastActivity)} {row.lastEditedCaseId ? `· ${row.lastEditedCaseId}` : ""}
                </div>
              </div>
              <div className="rounded-md bg-slate-900 px-3 py-2 text-right">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Forderungen</div>
                <div className="text-sm font-extrabold text-white">{formatCurrency(row.totalClaimAmount)}</div>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <HorizontalBar label="Aktive Fälle" value={row.activeCases} max={maxLoad} className="bg-blue-400" />
              <HorizontalBar label="Offene Aufgaben" value={row.openTasks} max={maxLoad} className="bg-amber-400" />
              <HorizontalBar label="Überfällig" value={row.overdueTasks} max={maxLoad} className="bg-red-400" />
              <HorizontalBar label="Termine Woche" value={row.appointmentsThisWeek} max={maxLoad} className="bg-emerald-400" />
              <HorizontalBar label="Schreiben" value={row.lettersTotal} max={maxLoad} className="bg-violet-400" />
              <HorizontalBar label="Nachrichten" value={row.messagesTotal} max={maxLoad} className="bg-slate-300" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SmallInfo label="Fälle gesamt" value={row.casesTotal} />
              <SmallInfo label="Abgeschlossen" value={row.completedCases} />
              <SmallInfo label="Erledigte Aufgaben" value={row.completedTasks} />
              <SmallInfo label="Verhandlungen" value={row.hearings} />
              <SmallInfo label="Besichtigungen" value={row.visits} />
              <SmallInfo label="Freigegebene Schreiben" value={row.approvedLetters} />
              <SmallInfo label="Fehlgeschlagene Nachrichten" value={row.failedMessages} warning={row.failedMessages > 0} />
              <SmallInfo label="Vergleichsbeträge" value={formatCurrency(row.settlementAmounts)} />
              <SmallInfo label="Offene Forderungen" value={formatCurrency(row.openClaimAmount)} />
              <SmallInfo label="ActivityLog" value={row.activityLogCount} />
              <SmallInfo label="Kommunikationsaktivität" value={row.communicationActivity} />
              <SmallInfo label="Terminlast" value={row.calendarLoad} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentQualityAnalyticsPanel({
  documentQuality,
  extraction,
  reviewBacklog,
  ocr,
}: {
  documentQuality: {
    totalDocuments: number;
    successful: number;
    ocrUsed: number;
    ocrRequired: number;
    failed: number;
    legacy: number;
    pendingChanges: number;
    documentsWithWarnings: number;
    missingRequiredDocuments: number;
    casesWithQualityProblems: number;
    statusDistribution: DistributionPoint[];
    employeeQuality: EmployeeQualityRow[];
    riskItems: DocumentRiskItem[];
  };
  extraction: {
    successRate: number;
    failedExtractions: number;
    averageExtractedFields: number;
    averageTextLength: number;
    commonWarnings: DistributionPoint[];
  };
  reviewBacklog: {
    openReviews: number;
    openLetterReviews: number;
    pendingExtractionChanges: number;
    unapprovedLetters: number;
    outdatedLetters: number;
    casesWithMultipleQualityWarnings: number;
  };
  ocr: {
    ocrRate: number;
    ocrUsed: number;
    ocrRequired: number;
    ocrRelevantDocuments: number;
    casesWithOcr: number;
  };
}) {
  return (
    <div className="space-y-5">
      <MetricGrid
        items={[
          ["OCR-Quote", `${ocr.ocrRate} %`],
          ["Extraktions-Erfolg", `${extraction.successRate} %`],
          ["Fehlende Pflichtdokumente", documentQuality.missingRequiredDocuments],
          ["Dokumente mit Warnungen", documentQuality.documentsWithWarnings],
          ["Fälle mit Qualitätsproblemen", documentQuality.casesWithQualityProblems],
          ["Offene Reviews", reviewBacklog.openReviews],
          ["Ø erkannte Felder", formatDecimal(extraction.averageExtractedFields)],
          ["Ø Textlänge", formatInteger(extraction.averageTextLength)],
        ]}
      />

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-md border border-slate-800 bg-slate-950/50 p-4">
          <div className="mb-3 text-sm font-extrabold text-white">Dokumentstatus</div>
          <DistributionBars data={documentQuality.statusDistribution} />
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950/50 p-4">
          <div className="mb-3 text-sm font-extrabold text-white">Review-Backlog</div>
          <DistributionBars
            data={[
              { key: "open", label: "Offene Reviews", value: reviewBacklog.openReviews },
              { key: "pending", label: "Ungeprüfte Änderungen", value: reviewBacklog.pendingExtractionChanges },
              { key: "unapproved", label: "Nicht freigegebene Schreiben", value: reviewBacklog.unapprovedLetters },
              { key: "outdated", label: "Veraltete Schreiben", value: reviewBacklog.outdatedLetters },
              { key: "multi", label: "Mehrere Qualitätswarnungen", value: reviewBacklog.casesWithMultipleQualityWarnings },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-md border border-slate-800 bg-slate-950/50 p-4">
          <div className="mb-3 text-sm font-extrabold text-white">Häufigste Warnungen</div>
          <DistributionBars data={extraction.commonWarnings} />
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950/50 p-4">
          <div className="mb-3 text-sm font-extrabold text-white">Qualitätsprobleme pro Mitarbeiter</div>
          <EmployeeQualityBars rows={documentQuality.employeeQuality} />
        </div>
      </section>

      <RiskList items={documentQuality.riskItems} />
    </div>
  );
}

function EmployeeQualityBars({ rows }: { rows: EmployeeQualityRow[] }) {
  const visible = rows.filter((row) => row.qualityProblemCases || row.ocrCases || row.openReviews || row.pendingChanges);
  if (visible.length === 0) return <ChartEmptyState />;
  const max = Math.max(...visible.flatMap((row) => [row.qualityProblemCases, row.ocrCases, row.openReviews, row.pendingChanges]), 1);
  return (
    <div className="space-y-4">
      {visible.map((row) => (
        <div key={row.id} className="space-y-2">
          <div className="font-extrabold text-white">{row.name}</div>
          <HorizontalBar label="Qualitätsfälle" value={row.qualityProblemCases} max={max} className="bg-red-400" />
          <HorizontalBar label="OCR-Fälle" value={row.ocrCases} max={max} className="bg-blue-400" />
          <HorizontalBar label="Reviews" value={row.openReviews} max={max} className="bg-amber-400" />
          <HorizontalBar label="Änderungen" value={row.pendingChanges} max={max} className="bg-violet-400" />
        </div>
      ))}
    </div>
  );
}

function RiskList({ items }: { items: DocumentRiskItem[] }) {
  if (items.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-700 bg-slate-950/50 p-6 text-sm font-semibold text-slate-400">Keine Qualitätsrisiken vorhanden.</div>;
  }

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50">
      <div className="border-b border-slate-800 px-4 py-3 text-sm font-extrabold text-white">Risiko-/Warnliste</div>
      <div className="divide-y divide-slate-800">
        {items.map((item) => (
          <div key={item.id} className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[120px_1fr_auto] lg:items-center">
            <div>
              <span className={riskBadgeClass(item.severity)}>{riskLabel(item.severity)}</span>
            </div>
            <div>
              <div className="font-extrabold text-white">{item.issue}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">{item.caseId} · {item.tenant || item.address || "Fall ohne Mieter"}</div>
            </div>
            <Link href={`/cases/${item.caseId}`} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 px-3 text-xs font-extrabold text-blue-200 hover:border-blue-500 hover:text-white">
              Zum Fall
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniBar({ value, max, className }: { value: number; max: number; className: string }) {
  return <div title={String(value)} className={`min-h-1 flex-1 rounded-t ${className}`} style={{ height: `${Math.max((value / max) * 100, value > 0 ? 4 : 0)}%` }} />;
}

function HorizontalBar({ label, value, max, className, formatter }: { label: string; value: number; max: number; className: string; formatter?: (value: number) => string }) {
  return (
    <div className="grid grid-cols-[112px_1fr_auto] items-center gap-2 text-xs">
      <div className="truncate font-bold text-slate-400">{label}</div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max((value / max) * 100, value > 0 ? 3 : 0)}%` }} />
      </div>
      <div className="min-w-10 text-right font-extrabold text-white">{formatter ? formatter(value) : value}</div>
    </div>
  );
}

function ChartLegend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(([label, color]) => (
        <div key={label} className="flex items-center gap-2 text-xs font-bold text-slate-400">
          <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
          {label}
        </div>
      ))}
    </div>
  );
}

function ChartEmptyState() {
  return <div className="rounded-md border border-dashed border-slate-700 bg-slate-950/50 p-6 text-sm font-semibold text-slate-400">Noch keine Daten vorhanden</div>;
}

function SmallInfo({ label, value, warning = false }: { label: string; value: ReactNode; warning?: boolean }) {
  return (
    <div className={warning ? "rounded-md border border-red-400/20 bg-red-500/10 px-3 py-2" : "rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2"}>
      <div className={warning ? "text-xs font-bold uppercase tracking-wide text-red-200" : "text-xs font-bold uppercase tracking-wide text-slate-500"}>{label}</div>
      <div className="mt-1 font-extrabold text-white">{value}</div>
    </div>
  );
}

function getVisiblePerformanceRows(rows: EmployeePerformanceRow[], user: { id?: string; name?: string; role?: string } | null): EmployeePerformanceRow[] {
  if (user?.role === "admin") return rows;
  const ownRows = rows.filter((row) => row.id === user?.id || row.name === user?.name);
  const otherRows = rows.filter((row) => row.id !== user?.id && row.name !== user?.name);
  if (otherRows.length === 0) return ownRows;
  return [...ownRows, summarizeOtherPerformanceRows(otherRows)];
}

function summarizeOtherPerformanceRows(rows: EmployeePerformanceRow[]): EmployeePerformanceRow {
  return rows.reduce<EmployeePerformanceRow>(
    (summary, row) => ({
      ...summary,
      casesTotal: summary.casesTotal + row.casesTotal,
      activeCases: summary.activeCases + row.activeCases,
      completedCases: summary.completedCases + row.completedCases,
      openTasks: summary.openTasks + row.openTasks,
      overdueTasks: summary.overdueTasks + row.overdueTasks,
      completedTasks: summary.completedTasks + row.completedTasks,
      appointmentsThisWeek: summary.appointmentsThisWeek + row.appointmentsThisWeek,
      hearings: summary.hearings + row.hearings,
      visits: summary.visits + row.visits,
      lettersTotal: summary.lettersTotal + row.lettersTotal,
      approvedLetters: summary.approvedLetters + row.approvedLetters,
      sentLetters: summary.sentLetters + row.sentLetters,
      messagesTotal: summary.messagesTotal + row.messagesTotal,
      sentMessages: summary.sentMessages + row.sentMessages,
      failedMessages: summary.failedMessages + row.failedMessages,
      totalClaimAmount: summary.totalClaimAmount + row.totalClaimAmount,
      settlementAmounts: summary.settlementAmounts + row.settlementAmounts,
      openClaimAmount: summary.openClaimAmount + row.openClaimAmount,
      activityLogCount: summary.activityLogCount + row.activityLogCount,
      communicationActivity: summary.communicationActivity + row.communicationActivity,
      calendarLoad: summary.calendarLoad + row.calendarLoad,
    }),
    {
      id: "other-visible",
      name: "Weitere sichtbare Mitarbeiter",
      casesTotal: 0,
      activeCases: 0,
      completedCases: 0,
      openTasks: 0,
      overdueTasks: 0,
      completedTasks: 0,
      appointmentsThisWeek: 0,
      hearings: 0,
      visits: 0,
      lettersTotal: 0,
      approvedLetters: 0,
      sentLetters: 0,
      messagesTotal: 0,
      sentMessages: 0,
      failedMessages: 0,
      totalClaimAmount: 0,
      settlementAmounts: 0,
      openClaimAmount: 0,
      activityLogCount: 0,
      communicationActivity: 0,
      calendarLoad: 0,
    },
  );
}

function formatDateTime(value?: string) {
  if (!value) return "Keine Aktivität";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("de-AT", { maximumFractionDigits: 1 }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("de-AT", { maximumFractionDigits: 0 }).format(value);
}

function riskLabel(severity: DocumentRiskItem["severity"]) {
  if (severity === "high") return "Hoch";
  if (severity === "medium") return "Mittel";
  return "Niedrig";
}

function riskBadgeClass(severity: DocumentRiskItem["severity"]) {
  if (severity === "high") return "inline-flex rounded-md bg-red-500/15 px-2.5 py-1 text-xs font-extrabold text-red-200";
  if (severity === "medium") return "inline-flex rounded-md bg-amber-500/15 px-2.5 py-1 text-xs font-extrabold text-amber-200";
  return "inline-flex rounded-md bg-slate-800 px-2.5 py-1 text-xs font-extrabold text-slate-200";
}

function openPrintableReport(report: AnalyticsReport) {
  const html = renderAnalyticsReportAsHtml(report);
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

function createReportFileName(kind: string, extension: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `MAWA_Management_Report_${kind}_${date}.${extension}`;
}

function AnalyticsEmptyState() {
  return (
    <section className="rounded-lg border border-dashed border-slate-700 bg-slate-900/70 p-10 text-center">
      <BarChart3 className="mx-auto text-slate-500" size={38} />
      <h2 className="mt-4 text-xl font-extrabold text-white">Noch keine Analytics-Daten vorhanden</h2>
      <p className="mt-2 text-sm text-slate-400">Sobald Fälle gespeichert sind, werden hier echte Kennzahlen angezeigt.</p>
      <Link href="/cases/new" className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500">
        Neuen Fall erstellen
      </Link>
    </section>
  );
}

function AnalyticsSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-extrabold text-white">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-blue-500/10 text-blue-300">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function ReportButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-extrabold text-slate-200 transition hover:border-blue-500 hover:text-white">
      {children}
    </button>
  );
}

function AnalyticsReportPreview({ report, onClose }: { report: AnalyticsReport; onClose: () => void }) {
  const text = renderAnalyticsReportAsText(report);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <div className="text-sm font-extrabold text-white">Management-Report</div>
            <div className="text-xs font-semibold text-slate-400">Zeitraum: {report.range}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-extrabold text-slate-200 hover:bg-slate-800">
            Schließen
          </button>
        </div>
        <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap bg-white p-6 text-sm leading-6 text-slate-950">{text}</pre>
      </div>
    </div>
  );
}

function KpiCard({ title, value, note, icon, tone }: { title: string; value: ReactNode; note: string; icon: ReactNode; tone: "blue" | "green" | "violet" | "amber" }) {
  const toneClasses = {
    blue: "bg-blue-500/10 text-blue-300",
    green: "bg-emerald-500/10 text-emerald-300",
    violet: "bg-violet-500/10 text-violet-300",
    amber: "bg-amber-500/10 text-amber-300",
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{title}</div>
        <div className={`grid h-9 w-9 place-items-center rounded-md ${toneClasses[tone]}`}>{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-extrabold text-white">{value}</div>
      <div className="mt-1 text-xs font-semibold text-slate-400">{note}</div>
    </div>
  );
}

function MetricGrid({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-3">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-lg font-extrabold text-white">{value}</div>
        </div>
      ))}
    </div>
  );
}

function EmployeeRows({ rows }: { rows: EmployeeAnalyticsRow[] }) {
  if (rows.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-700 bg-slate-950/50 p-6 text-sm font-semibold text-slate-400">Noch keine Mitarbeiterdaten vorhanden.</div>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-800">
      <div className="hidden grid-cols-[1.5fr_repeat(5,1fr)] bg-slate-950 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-500 md:grid">
        <div>Mitarbeiter</div>
        <div>Fälle</div>
        <div>Offen</div>
        <div>Termine</div>
        <div>Schreiben</div>
        <div>Kommunikation</div>
      </div>
      <div className="divide-y divide-slate-800">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-3 p-4 text-sm md:grid-cols-[1.5fr_repeat(5,1fr)]">
            <div>
              <div className="font-extrabold text-white">{row.name}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">{row.activeCases} aktive Fälle</div>
            </div>
            <MobileMetric label="Fälle" value={row.cases} />
            <MobileMetric label="Offene Aufgaben" value={row.openTasks} />
            <MobileMetric label="Termine" value={row.appointments} />
            <MobileMetric label="Schreiben" value={row.letters} />
            <MobileMetric label="Kommunikation" value={row.communication} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500 md:hidden">{label}</div>
      <div className="font-extrabold text-slate-100">{value}</div>
    </div>
  );
}
