"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  FilePlus2,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { canEditCase, canShareCase, type PublicUser } from "@/lib/auth";
import { formatStoredDate } from "@/lib/case-service";
import { formatCurrency } from "@/lib/utils";
import type { CaseStatus, SavedCaseRecord, User } from "@/types/case";

export type CaseSegmentId = "all" | "new" | "active" | "letter" | "closed" | "shared" | "unassigned";
export type CaseStatusFilter = "all" | CaseStatus;
export type CaseOwnerFilter = "all" | "unassigned" | string;

export type CaseSegment = {
  id: CaseSegmentId;
  label: string;
  count: number;
};

export type CaseActionHandlers = {
  onShare: (record: SavedCaseRecord) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
};

export const caseStatusFilters: Array<{ value: CaseStatusFilter; label: string }> = [
  { value: "all", label: "Alle Status" },
  { value: "Entwurf", label: "Entwurf" },
  { value: "Dokumente hochgeladen", label: "Dokumente hochgeladen" },
  { value: "Daten geprüft", label: "Daten geprüft" },
  { value: "Berechnung abgeschlossen", label: "Berechnung abgeschlossen" },
  { value: "Schreiben erstellt", label: "Schreiben erstellt" },
  { value: "Abgeschlossen", label: "Abgeschlossen" },
];

export function CaseListHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-blue-300">Fallmanagement</div>
        <h1 className="mt-1 text-3xl font-extrabold text-white">Fälle</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Mandate, Status, Zuständigkeiten und Forderungen in einer kompakten Arbeitsliste.
        </p>
      </div>
      <Button asChild className="border-blue-500 bg-blue-600 hover:bg-blue-500">
        <Link href="/cases/new">
          <Plus size={17} />
          Neuer Fall
        </Link>
      </Button>
    </div>
  );
}

export function CaseStatusSegments({
  segments,
  activeSegment,
  onChange,
}: {
  segments: CaseSegment[];
  activeSegment: CaseSegmentId;
  onChange: (segment: CaseSegmentId) => void;
}) {
  return (
    <section className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {segments.map((segment) => {
        const active = activeSegment === segment.id;
        return (
          <button
            key={segment.id}
            type="button"
            onClick={() => onChange(segment.id)}
            className={
              active
                ? "rounded-lg border border-blue-400/50 bg-blue-500/15 p-4 text-left shadow-sm shadow-blue-950/30"
                : "rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-slate-700 hover:bg-slate-900"
            }
          >
            <div className={active ? "text-xs font-extrabold uppercase tracking-wide text-blue-200" : "text-xs font-extrabold uppercase tracking-wide text-slate-500"}>{segment.label}</div>
            <div className="mt-3 text-3xl font-extrabold leading-none text-white">{segment.count}</div>
          </button>
        );
      })}
    </section>
  );
}

export function CaseFilters({
  query,
  status,
  owner,
  employees,
  isAdmin,
  onQueryChange,
  onStatusChange,
  onOwnerChange,
}: {
  query: string;
  status: CaseStatusFilter;
  owner: CaseOwnerFilter;
  employees: User[];
  isAdmin: boolean;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: CaseStatusFilter) => void;
  onOwnerChange: (value: CaseOwnerFilter) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_220px]">
        <label className={isAdmin ? "relative" : "relative lg:col-span-2"}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="h-11 w-full rounded-md border border-slate-700 bg-slate-950/70 pl-10 pr-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            placeholder="Nach Fallnummer, Mieter, Adresse oder Mitarbeiter suchen"
          />
        </label>
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value as CaseStatusFilter)}
          className="h-11 rounded-md border border-slate-700 bg-slate-950/70 px-3 text-sm font-semibold text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          {caseStatusFilters.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        {isAdmin && (
          <select
            value={owner}
            onChange={(event) => onOwnerChange(event.target.value as CaseOwnerFilter)}
            className="h-11 rounded-md border border-slate-700 bg-slate-950/70 px-3 text-sm font-semibold text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">Alle Mitarbeiter</option>
            <option value="unassigned">Nicht zugewiesen</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
        )}
      </div>
    </section>
  );
}

export function CaseTable({
  records,
  user,
  actions,
}: {
  records: SavedCaseRecord[];
  user: PublicUser | null;
  actions: CaseActionHandlers;
}) {
  return (
    <div className="hidden overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70 lg:block">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-slate-950/70 text-xs uppercase text-slate-500">
          <tr>
            <th className="w-[120px] px-4 py-3">Fallnummer</th>
            <th className="w-[180px] px-4 py-3">Mieter</th>
            <th className="px-4 py-3">Adresse</th>
            <th className="w-[170px] px-4 py-3">Status</th>
            <th className="w-[165px] px-4 py-3">Mitarbeiter</th>
            <th className="w-[130px] px-4 py-3 text-right">Forderung</th>
            <th className="w-[135px] px-4 py-3">Letzte Änderung</th>
            <th className="w-[260px] px-4 py-3 text-right">Aktionen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {records.map((record) => (
            <tr key={record.id} className="transition hover:bg-slate-800/45">
              <td className="px-4 py-4 font-extrabold text-blue-300">
                <Link href={`/cases/${record.id}`}>{record.id}</Link>
              </td>
              <td className="truncate px-4 py-4 font-bold text-white">{record.tenant || "-"}</td>
              <td className="truncate px-4 py-4 text-slate-400">{record.address || "-"}</td>
              <td className="px-4 py-4"><StatusBadge status={record.status} /></td>
              <td className="px-4 py-4">
                <OwnerLabel record={record} user={user} />
              </td>
              <td className="px-4 py-4 text-right font-extrabold text-white">{formatCurrency(record.claimAmount)}</td>
              <td className="px-4 py-4 text-xs font-semibold text-slate-500">{formatStoredDate(record.updatedAt)}</td>
              <td className="px-4 py-4">
                <CaseActionButtons record={record} user={user} actions={actions} align="end" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CaseMobileCards({
  records,
  user,
  actions,
}: {
  records: SavedCaseRecord[];
  user: PublicUser | null;
  actions: CaseActionHandlers;
}) {
  return (
    <div className="grid gap-3 lg:hidden">
      {records.map((record) => (
        <article key={record.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/cases/${record.id}`} className="font-extrabold text-blue-300">{record.id}</Link>
              <div className="mt-1 truncate text-lg font-extrabold text-white">{record.tenant || "-"}</div>
            </div>
            <StatusBadge status={record.status} />
          </div>
          <div className="mt-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-slate-400">{record.address || "-"}</div>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-950/35 p-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Forderung</div>
              <div className="mt-1 font-extrabold text-white">{formatCurrency(record.claimAmount)}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Eigentümer</div>
              <OwnerLabel record={record} user={user} />
            </div>
          </div>
          <div className="mt-4">
            <CaseActionButtons record={record} user={user} actions={actions} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function CaseActionButtons({
  record,
  user,
  actions,
  align = "start",
}: {
  record: SavedCaseRecord;
  user: PublicUser | null;
  actions: CaseActionHandlers;
  align?: "start" | "end";
}) {
  const canEdit = canEditCase(user, record);
  const canShare = canShareCase(user, record);
  const completed = record.status === "Abgeschlossen";
  const wrapperClass = align === "end" ? "flex flex-wrap items-center justify-end gap-2" : "flex flex-wrap items-center gap-2";

  return (
    <div className={wrapperClass}>
      <ActionLink href={`/cases/${record.id}`} title="Fall öffnen">
        <FolderOpen size={14} />
        Öffnen
      </ActionLink>
      <ActionLink href={`/cases/${record.id}/edit`} title="Fall bearbeiten" disabled={!canEdit}>
        <Pencil size={14} />
        {canEdit ? "Bearbeiten" : "Nur lesen"}
      </ActionLink>
      {canShare && (
        <ActionButton title="Fall teilen" onClick={() => actions.onShare(record)}>
          <Share2 size={14} />
          Teilen
        </ActionButton>
      )}
      <ActionButton title="Fall abschließen" onClick={() => actions.onComplete(record.id)} disabled={!canEdit || completed}>
        <CheckCircle2 size={14} />
        Abschließen
      </ActionButton>
      <ActionButton title="Fall löschen" onClick={() => actions.onDelete(record.id)} disabled={!canEdit} danger>
        <Trash2 size={14} />
        Löschen
      </ActionButton>
    </div>
  );
}

export function CasesEmptyState() {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-slate-700 bg-slate-900/55 px-5 py-14 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-lg bg-blue-400/20 blur-xl" />
        <div className="relative grid h-14 w-14 place-items-center rounded-lg bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20">
          <FilePlus2 size={26} />
        </div>
      </div>
      <h2 className="mt-4 text-xl font-extrabold text-white">Noch keine Fälle vorhanden</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
        Erstellen Sie den ersten Fall, um Dokumente, Berechnung, Zuständigkeit und Export zentral zu verwalten.
      </p>
      <Button asChild className="mt-5 border-blue-500 bg-blue-600 hover:bg-blue-500">
        <Link href="/cases/new">Neuen Fall erstellen</Link>
      </Button>
    </div>
  );
}

function OwnerLabel({ record, user }: { record: SavedCaseRecord; user: PublicUser | null }) {
  const sharedWithCurrentUser = Boolean(user && record.ownerId !== user.id && (record.sharedWith ?? []).some((share) => share.userId === user.id));

  return (
    <div className="min-w-0">
      <div className={record.ownerName ? "truncate text-xs font-bold text-slate-300" : "inline-flex rounded-md bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-200"}>
        {record.ownerName ?? "Nicht zugewiesen"}
      </div>
      {sharedWithCurrentUser && <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-violet-300">Geteilt mit mir</div>}
    </div>
  );
}

function ActionLink({
  href,
  title,
  disabled,
  children,
}: {
  href: string;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-disabled={disabled}
      className={
        disabled
          ? "pointer-events-none inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-800 px-2.5 text-xs font-bold text-slate-600"
          : "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-700 px-2.5 text-xs font-bold text-slate-200 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
      }
    >
      {children}
    </Link>
  );
}

function ActionButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  const enabledClass = danger
    ? "border-red-500/30 text-red-200 hover:bg-red-500/10"
    : "border-slate-700 text-slate-200 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200";

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-bold transition disabled:border-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent ${enabledClass}`}
    >
      {children}
    </button>
  );
}
