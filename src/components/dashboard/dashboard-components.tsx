"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  FilePlus2,
  Gavel,
  Home,
  LucideIcon,
  MinusCircle,
  Percent,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { EmployeeDashboardRow } from "@/lib/dashboard-metrics";
import type { SavedCaseRecord } from "@/types/case";

type Tone = "blue" | "green" | "orange" | "red" | "violet" | "slate";

const toneClasses: Record<Tone, { border: string; icon: string; text: string; glow: string; badge: string }> = {
  blue: { border: "border-blue-500/30", icon: "bg-blue-500/15 text-blue-300", text: "text-blue-300", glow: "from-blue-500/20", badge: "bg-blue-500/10 text-blue-200 ring-blue-400/20" },
  green: { border: "border-emerald-500/30", icon: "bg-emerald-500/15 text-emerald-300", text: "text-emerald-300", glow: "from-emerald-500/20", badge: "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20" },
  orange: { border: "border-orange-500/30", icon: "bg-orange-500/15 text-orange-300", text: "text-orange-300", glow: "from-orange-500/20", badge: "bg-orange-500/10 text-orange-200 ring-orange-400/20" },
  red: { border: "border-red-500/30", icon: "bg-red-500/15 text-red-300", text: "text-red-300", glow: "from-red-500/20", badge: "bg-red-500/10 text-red-200 ring-red-400/20" },
  violet: { border: "border-violet-500/30", icon: "bg-violet-500/15 text-violet-300", text: "text-violet-300", glow: "from-violet-500/20", badge: "bg-violet-500/10 text-violet-200 ring-violet-400/20" },
  slate: { border: "border-slate-700", icon: "bg-slate-800 text-slate-300", text: "text-slate-300", glow: "from-slate-500/10", badge: "bg-slate-800 text-slate-300 ring-slate-700" },
};

export function DashboardStatCard({
  title,
  value,
  note,
  icon: Icon,
  tone = "blue",
}: {
  title: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  const toneClass = toneClasses[tone];

  return (
    <div className={`relative flex min-h-[152px] flex-col overflow-hidden rounded-lg border ${toneClass.border} bg-slate-900/80 p-4 shadow-sm shadow-slate-950/30`}>
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${toneClass.glow} via-white/20 to-transparent`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`inline-flex rounded-md px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide ring-1 ${toneClass.badge}`}>{title}</div>
          <div className="mt-4 text-4xl font-extrabold leading-none text-white">{value}</div>
        </div>
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ring-1 ring-white/10 ${toneClass.icon}`}>
          <Icon size={19} />
        </div>
      </div>
      <div className="mt-auto pt-4">
        <div className="h-px bg-slate-800/80" />
        <div className="mt-3 text-sm leading-5 text-slate-400">
          <span className={`font-bold ${toneClass.text}`}>{note}</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardMetricCard({
  title,
  value,
  note,
  icon: Icon,
  tone = "slate",
  muted = false,
}: {
  title: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: Tone;
  muted?: boolean;
}) {
  const toneClass = toneClasses[tone];

  return (
    <div className={muted ? "flex min-h-[148px] flex-col rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4" : "flex min-h-[148px] flex-col rounded-lg border border-slate-800 bg-slate-900/70 p-4 shadow-sm shadow-slate-950/20"}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-bold leading-5 text-slate-300">{title}</div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ring-1 ring-white/10 ${toneClass.icon}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="mt-4 text-3xl font-extrabold leading-none text-white">{value}</div>
      <div className="mt-auto pt-3">
        <div className={muted ? "rounded-md bg-slate-950/50 px-2.5 py-2 text-xs font-semibold leading-5 text-slate-400" : "text-xs font-semibold leading-5 text-slate-500"} title={note}>
          {muted ? `Datenquelle ausständig: ${note}` : note}
        </div>
      </div>
    </div>
  );
}

export function AdminEmployeeCard({ employee }: { employee: EmployeeDashboardRow }) {
  const isUnassigned = employee.id === "unassigned";

  return (
    <div className={isUnassigned ? "rounded-lg border border-dashed border-amber-400/40 bg-amber-950/10 p-4" : "rounded-lg border border-slate-800 bg-slate-900/70 p-4"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
          {isUnassigned ? <AlertTriangle className="shrink-0 text-amber-300" size={16} /> : <Users className="shrink-0 text-blue-300" size={16} />}
          <span className="truncate">{employee.name}</span>
        </div>
        <span className={isUnassigned ? "rounded-md bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-200" : "rounded-md bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-300"}>{employee.today} heute</span>
      </div>
      {isUnassigned && <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs font-semibold leading-5 text-amber-100">Diese Fälle haben noch keinen verantwortlichen Mitarbeiter.</div>}
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <EmployeeMetric label="Fälle" value={employee.total} />
        <EmployeeMetric label="Offen" value={employee.open} />
        <EmployeeMetric label="Aktiv" value={employee.active} tone="blue" />
        <EmployeeMetric label="Gewonnen" value={employee.won} tone="green" />
        <EmployeeMetric label="Verloren" value={employee.lost} tone="red" />
      </div>
    </div>
  );
}

function EmployeeMetric({ label, value, tone = "slate" }: { label: string; value: number; tone?: Tone }) {
  const textClass = toneClasses[tone].text;

  return (
    <div className="rounded-md border border-slate-800/80 bg-slate-950/35 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-extrabold leading-none ${tone === "slate" ? "text-white" : textClass}`}>{value}</div>
    </div>
  );
}

export function RecentCasesSection({ records }: { records: SavedCaseRecord[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="font-bold text-white">Letzte Fälle</h2>
          <p className="mt-1 text-sm text-slate-500">Aktuelle Fälle aus dem sichtbaren Arbeitsbereich.</p>
        </div>
        <Link className="text-sm font-bold text-blue-300 hover:text-blue-200" href="/cases">
          Alle anzeigen
        </Link>
      </div>
      {records.length > 0 ? (
        <>
          <RecentCasesTable records={records} />
          <RecentCasesMobileCards records={records} />
        </>
      ) : (
        <EmptyCasesState />
      )}
    </section>
  );
}

export function RecentCasesTable({ records }: { records: SavedCaseRecord[] }) {
  return (
    <div className="hidden lg:block">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-slate-950/60 text-xs uppercase text-slate-500">
          <tr>
            <th className="w-[110px] px-5 py-3">Fall-ID</th>
            <th className="px-5 py-3">Mieter</th>
            <th className="px-5 py-3">Adresse</th>
            <th className="w-[150px] px-5 py-3">Mitarbeiter</th>
            <th className="w-[170px] px-5 py-3">Status</th>
            <th className="px-5 py-3 text-right">Forderung</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {records.map((item) => (
            <tr key={item.id} className="transition hover:bg-slate-800/40">
              <td className="px-5 py-4 font-bold text-blue-300">
                <Link href={`/cases/${item.id}`}>{item.id}</Link>
              </td>
              <td className="truncate px-5 py-4 font-semibold text-white">{item.tenant || "-"}</td>
              <td className="truncate px-5 py-4 text-slate-400">{item.address || "-"}</td>
              <td className="truncate px-5 py-4 text-slate-400">{item.ownerName ?? "Nicht zugewiesen"}</td>
              <td className="px-5 py-4"><StatusBadge status={item.status} /></td>
              <td className="px-5 py-4 text-right font-bold text-white">{formatCurrency(item.claimAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecentCasesMobileCards({ records }: { records: SavedCaseRecord[] }) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
      {records.map((item) => (
        <Link key={item.id} href={`/cases/${item.id}`} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 transition hover:border-blue-500/40 hover:bg-slate-900/80">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-blue-300">{item.id}</div>
              <div className="mt-1 truncate font-semibold text-white">{item.tenant || "-"}</div>
            </div>
            <StatusBadge status={item.status} />
          </div>
          <div className="mt-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-slate-400">{item.address || "-"}</div>
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <span className={item.ownerName ? "truncate font-semibold text-slate-500" : "rounded-md bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-200"}>{item.ownerName ?? "Nicht zugewiesen"}</span>
            <span className="font-extrabold text-white">{formatCurrency(item.claimAmount)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function EmptyCasesState() {
  return (
    <div className="grid place-items-center px-5 py-14 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-lg bg-blue-400/20 blur-xl" />
        <div className="relative grid h-14 w-14 place-items-center rounded-lg bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20">
          <FilePlus2 size={26} />
        </div>
      </div>
      <h3 className="mt-4 text-lg font-extrabold text-white">Noch keine Fälle sichtbar</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">Erstelle den ersten Fall oder weise bestehende Fälle zu. Danach erscheinen hier Status, Forderung und Verantwortliche.</p>
      <Button asChild className="mt-5">
        <Link href="/cases/new">Neuen Fall erstellen</Link>
      </Button>
    </div>
  );
}

export function FeaturedCaseCard({ record }: { record?: SavedCaseRecord }) {
  return (
    <aside className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-white">Fallübersicht</h2>
        <Eye className="text-blue-300" size={18} />
      </div>
      {record ? (
        <>
          <div className="mt-5">
            <div className="font-bold text-white">{record.tenant || "-"}</div>
            <div className="mt-1 text-sm leading-5 text-slate-400">{record.address || "-"}</div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <SummaryRow label="Aktuelle Gesamtmiete" value={formatCurrency(record.calculation.currentGrossRent)} />
            <SummaryRow label="Erlaubte Gesamtmiete" value={formatCurrency(record.calculation.allowedGrossRent)} />
            <SummaryRow label="Monatliche Überschreitung" value={formatCurrency(record.calculation.monthlyExcess)} tone="danger" />
            <SummaryRow label="Zeitraum" value={`${record.calculation.months} Monate`} />
            <SummaryRow label="Nettoforderung" value={formatCurrency(record.calculation.settlementAmount)} strong />
          </div>
          <Button asChild className="mt-6 w-full" variant="secondary">
            <Link href={`/cases/${record.id}`}>Fall öffnen<ArrowRight size={16} /></Link>
          </Button>
        </>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-5 text-center">
          <ClipboardList className="mx-auto text-slate-500" size={24} />
          <div className="mt-3 text-sm font-semibold leading-6 text-slate-400">Noch kein Fall für die Schnellansicht vorhanden.</div>
        </div>
      )}
    </aside>
  );
}

function SummaryRow({ label, value, tone, strong }: { label: string; value: string; tone?: "danger"; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-400">{label}</span>
      <span className={tone === "danger" ? "font-bold text-red-300" : strong ? "text-lg font-extrabold text-white" : "font-semibold text-white"}>{value}</span>
    </div>
  );
}

export const dashboardIcons = {
  newCases: FilePlus2,
  ready: CheckCircle2,
  active: Clock3,
  won: TrendingUp,
  lost: XCircle,
  conversion: Percent,
  overpayment: Banknote,
  revenue: TrendingUp,
  average: MinusCircle,
  threshold: AlertTriangle,
  invoice: Banknote,
  cancel: TrendingDown,
  today: CalendarDays,
  week: CalendarDays,
  hearings: Gavel,
  visits: Home,
  overdue: AlertTriangle,
  due: Clock3,
};
