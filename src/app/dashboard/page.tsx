"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AdminEmployeeCard,
  DashboardMetricCard,
  DashboardStatCard,
  FeaturedCaseCard,
  RecentCasesSection,
  dashboardIcons,
} from "@/components/dashboard/dashboard-components";
import { CaseService, CaseServiceAsync } from "@/lib/case-service";
import { demoUsers, visibleCases } from "@/lib/auth";
import { useAuth } from "@/lib/use-auth";
import { getDashboardStats, getEmployeeDashboardRows } from "@/lib/dashboard-metrics";
import { formatCurrency } from "@/lib/utils";
import type { SavedCaseRecord } from "@/types/case";

export default function DashboardPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const asyncRecords = await CaseServiceAsync.list();
        if (!cancelled) setRecords(asyncRecords);
      } catch (error) {
        console.warn("Async-Dashboarddaten konnten nicht geladen werden. LocalStorage-Fallback wird genutzt.", error);
        const fallbackRecords = CaseService.list();
        if (!cancelled) {
          setRecords(fallbackRecords);
          setLoadError("Dashboarddaten konnten nicht aus dem vorbereiteten Online-Repository geladen werden. Lokale Daten werden angezeigt.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    window.addEventListener("mietpilot-cases-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("mietpilot-cases-changed", load);
    };
  }, []);

  const visibleRecords = useMemo(() => visibleCases(user, records), [records, user]);
  const scopeRecords = user?.role === "admin" ? records : visibleRecords;
  const latest = scopeRecords.slice(0, 6);
  const stats = getDashboardStats(scopeRecords);
  const employeeRows = getEmployeeDashboardRows(records, demoUsers);
  const emptyTaskNote = "Noch keine Aufgaben/Termine vorhanden";
  const hasTaskMetrics = stats.hasTasks;

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-blue-300">MAWA Admin</div>
            <h1 className="mt-1 text-2xl font-extrabold text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">
              {user?.role === "admin" ? "Alle Fälle, Kennzahlen und Mitarbeiter im Überblick." : "Eigene und freigegebene Fälle im Überblick."}
            </p>
          </div>
          <Button asChild>
            <Link href="/cases/new">
              <Plus size={17} />
              Neuer Fall
            </Link>
          </Button>
        </div>

        {loading && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
            Dashboarddaten werden geladen ...
          </div>
        )}
        {loadError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {loadError}
          </div>
        )}

        <section className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-6">
          <DashboardStatCard title="Neue Fälle" value={stats.newCases} note="Heute neu angelegt" icon={dashboardIcons.newCases} tone="blue" />
          <DashboardStatCard title="Bereit" value={stats.ready} note="Daten geprüft und verwertbar" icon={dashboardIcons.ready} tone="green" />
          <DashboardStatCard title="Aktiv" value={stats.active} note="In laufender Bearbeitung" icon={dashboardIcons.active} tone="orange" />
          <DashboardStatCard title="Gewonnen" value={stats.won} note="Erfolgreich abgeschlossen" icon={dashboardIcons.won} tone="green" />
          <DashboardStatCard title="Verloren" value={stats.lost} note="Abgeschlossen ohne Forderung" icon={dashboardIcons.lost} tone="red" />
          <DashboardStatCard title="Conversion" value={`${stats.conversion} %`} note="Gewonnen im Verhältnis zu erledigt" icon={dashboardIcons.conversion} tone="violet" />
        </section>

        <section className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <DashboardMetricCard title="Gesamt-Überzahlung" value={formatCurrency(stats.totalOverpayment)} note="Summe aller sichtbaren Forderungen" icon={dashboardIcons.overpayment} tone="blue" />
          <DashboardMetricCard title="MAWA-Umsatz" value={formatCurrency(stats.mawaRevenue)} note="MVP-Regel: 100 % bis EUR 3.000, danach 55 %" icon={dashboardIcons.revenue} tone="green" />
          <DashboardMetricCard title="Ø monatliche Überzahlung" value={formatCurrency(stats.avgMonthlyExcess)} note="Durchschnitt pro sichtbarem Fall" icon={dashboardIcons.average} tone="orange" />
          <DashboardMetricCard title="Über Bagatellgrenze" value={stats.aboveThreshold} note="Forderungen über EUR 1.000" icon={dashboardIcons.threshold} tone="violet" />
          <DashboardMetricCard title="Ø Rechnungsbetrag" value={formatCurrency(stats.avgInvoice)} note="Durchschnitt aus positiven Forderungen" icon={dashboardIcons.invoice} tone="blue" />
          <DashboardMetricCard title="Storno-Quote" value={`${stats.cancelRate} %`} note="Verlorene Fälle im Verhältnis zu gesamt" icon={dashboardIcons.cancel} tone="red" />
        </section>

        <section className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <DashboardMetricCard title="Termine heute" value={stats.appointmentsToday} note={hasTaskMetrics ? "Termine, Verhandlungen und Besichtigungen" : emptyTaskNote} icon={dashboardIcons.today} tone="blue" muted={!hasTaskMetrics} />
          <DashboardMetricCard title="Diese Woche" value={stats.appointmentsWeek} note={hasTaskMetrics ? "Termine in der aktuellen Woche" : emptyTaskNote} icon={dashboardIcons.week} tone="violet" muted={!hasTaskMetrics} />
          <DashboardMetricCard title="Verhandlungen" value={stats.hearings} note={hasTaskMetrics ? "Offene und kommende Verhandlungen" : emptyTaskNote} icon={dashboardIcons.hearings} tone="orange" muted={!hasTaskMetrics} />
          <DashboardMetricCard title="Besichtigungen" value={stats.visits} note={hasTaskMetrics ? "Offene und kommende Besichtigungen" : emptyTaskNote} icon={dashboardIcons.visits} tone="green" muted={!hasTaskMetrics} />
          <DashboardMetricCard title="Überfällige Erinnerungen" value={stats.overdueReminders} note={hasTaskMetrics ? "Überfällige Erinnerungen, Follow-ups und Fristen" : emptyTaskNote} icon={dashboardIcons.overdue} tone="red" muted={!hasTaskMetrics} />
          <DashboardMetricCard title="Fällige Erinnerungen" value={stats.dueReminders} note={hasTaskMetrics ? "Fällig in den nächsten 7 Tagen" : emptyTaskNote} icon={dashboardIcons.due} tone="orange" muted={!hasTaskMetrics} />
        </section>

        {user?.role === "admin" && (
          <section className="rounded-lg border border-slate-800 bg-slate-900/70">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="font-bold text-white">Mitarbeiter</h2>
              <p className="mt-1 text-sm text-slate-500">Fallverteilung pro Mitarbeiter.</p>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {employeeRows.map((employee) => <AdminEmployeeCard key={employee.id} employee={employee} />)}
            </div>
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <RecentCasesSection records={latest} />
          <FeaturedCaseCard record={latest[0]} />
        </section>
      </div>
    </div>
  );
}
