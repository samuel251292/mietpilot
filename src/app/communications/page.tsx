"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, Download, Eye, FileText, Mail, Paperclip, Pencil, Search, Send, XCircle } from "lucide-react";
import { CommunicationAttachmentList, CommunicationStatusBadge } from "@/components/communication/communication-components";
import { canEditCase, visibleCases } from "@/lib/auth";
import { CaseService, CaseServiceAsync, formatStoredDate } from "@/lib/case-service";
import { archiveMessage, markMessageFailed, markMessageReady, markMessageSentManual, updateDraftMessage } from "@/lib/communication/communication-service";
import { useAuth } from "@/lib/use-auth";
import type { CommunicationAttachment, CommunicationChannel, CommunicationMessage, CommunicationMessageStatus, CommunicationParticipant, CommunicationThread, SavedCaseRecord } from "@/types/case";

type CommunicationRow = {
  id: string;
  caseRecord: SavedCaseRecord;
  thread: CommunicationThread;
  message: CommunicationMessage;
};

type StatusFilter = "Alle" | "Entwurf" | "Bereit" | "Warteschlange" | "Versendet" | "Fehlgeschlagen" | "Empfangen" | "Archiviert";
type ChannelFilter = "Alle" | "E-Mail" | "Intern" | "Manuell" | "Sonstiges";

type DraftUpdates = {
  to: CommunicationParticipant[];
  cc: CommunicationParticipant[];
  bcc: CommunicationParticipant[];
  subject: string;
  bodyText: string;
};

const statusFilters: StatusFilter[] = ["Alle", "Entwurf", "Bereit", "Warteschlange", "Versendet", "Fehlgeschlagen", "Empfangen", "Archiviert"];
const channelFilters: ChannelFilter[] = ["Alle", "E-Mail", "Intern", "Manuell", "Sonstiges"];

export default function CommunicationsPage() {
  const { user, loaded } = useAuth();
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Alle");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("Alle");
  const [onlyWithAttachments, setOnlyWithAttachments] = useState(false);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [preview, setPreview] = useState<CommunicationRow | null>(null);
  const [editing, setEditing] = useState<CommunicationRow | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingRecords(true);
      setLoadError("");
      try {
        const asyncRecords = await CaseServiceAsync.list();
        if (!cancelled) setRecords(asyncRecords);
      } catch (error) {
        console.warn("Async-Kommunikationsfälle konnten nicht geladen werden. LocalStorage-Fallback wird genutzt.", error);
        const fallbackRecords = CaseService.list();
        if (!cancelled) {
          setRecords(fallbackRecords);
          setLoadError("Kommunikation konnte nicht aus dem vorbereiteten Online-Repository geladen werden. Lokale Daten werden angezeigt.");
        }
      } finally {
        if (!cancelled) setLoadingRecords(false);
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

  const rows = useMemo(() => collectCommunicationRows(visibleCases(user, records)), [records, user]);
  const filteredRows = useMemo(
    () => rows.filter((row) => matchesFilters(row, { query, statusFilter, channelFilter, onlyWithAttachments, onlyFailed })),
    [rows, query, statusFilter, channelFilter, onlyWithAttachments, onlyFailed],
  );
  const stats = useMemo(() => buildStats(rows), [rows]);

  function saveRecord(nextRecord: SavedCaseRecord) {
    const saved = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    setRecords((current) => current.map((record) => (record.id === saved.id ? saved : record)));
  }

  function saveDraft(row: CommunicationRow, updates: DraftUpdates) {
    saveRecord(updateDraftMessage(row.caseRecord, row.thread.id, row.message.id, { ...updates, actor: user }));
  }

  function ready(row: CommunicationRow) {
    saveRecord(markMessageReady(row.caseRecord, row.thread.id, row.message.id, user));
  }

  function sent(row: CommunicationRow) {
    if (row.message.status === "draft" && !window.confirm("Dieser Entwurf ist noch nicht bereit markiert. Trotzdem als versendet protokollieren?")) return;
    const methodInput = window.prompt("Versandmethode: email, post, manual oder other", "email") ?? "email";
    const method = methodInput === "email" || methodInput === "post" || methodInput === "manual" || methodInput === "other" ? methodInput : "manual";
    const note = window.prompt("Versandnotiz optional:") ?? undefined;
    saveRecord(markMessageSentManual(row.caseRecord, row.thread.id, row.message.id, { actor: user, method, note }));
  }

  function failed(row: CommunicationRow) {
    const error = window.prompt("Fehlernotiz optional:", row.message.error ?? "") ?? undefined;
    saveRecord(markMessageFailed(row.caseRecord, row.thread.id, row.message.id, error, user));
  }

  function archive(row: CommunicationRow) {
    saveRecord(archiveMessage(row.caseRecord, row.thread.id, row.message.id, user));
  }

  if (!loaded) return null;

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Kommunikation</h1>
            <p className="mt-1 text-sm text-slate-400">Zentrale Übersicht über Kommunikations-Threads und Nachrichten aus sichtbaren Fällen.</p>
          </div>
        </header>

        {loadingRecords && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
            Kommunikation wird geladen ...
          </div>
        )}
        {loadError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {loadError}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Entwürfe" value={stats.draft} tone="amber" />
          <KpiCard label="Bereit" value={stats.ready} tone="green" />
          <KpiCard label="Versendet" value={stats.sent} tone="blue" />
          <KpiCard label="Fehlgeschlagen" value={stats.failed} tone="red" />
          <KpiCard label="Archiviert" value={stats.archived} tone="slate" />
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="grid gap-3 xl:grid-cols-[1fr_170px_170px_auto_auto]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Fallnummer, Mieter, Adresse, Betreff, Empfänger suchen"
                className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm font-semibold text-white outline-none focus:border-blue-500"
              />
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white">
              {statusFilters.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value as ChannelFilter)} className="h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white">
              {channelFilters.map((channel) => <option key={channel}>{channel}</option>)}
            </select>
            <label className="flex h-11 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-bold text-slate-200">
              <input type="checkbox" checked={onlyWithAttachments} onChange={(event) => setOnlyWithAttachments(event.target.checked)} />
              Nur mit Anhängen
            </label>
            <label className="flex h-11 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-bold text-slate-200">
              <input type="checkbox" checked={onlyFailed} onChange={(event) => setOnlyFailed(event.target.checked)} />
              Nur fehlgeschlagen
            </label>
          </div>
        </section>

        {rows.length === 0 ? (
          <CommunicationEmptyState />
        ) : (
          <>
            <DesktopCommunicationTable
              rows={filteredRows}
              userCanEdit={(row) => canEditCase(user, row.caseRecord)}
              onPreview={setPreview}
              onEdit={setEditing}
              onReady={ready}
              onSent={sent}
              onFailed={failed}
              onArchive={archive}
            />
            <MobileCommunicationCards
              rows={filteredRows}
              userCanEdit={(row) => canEditCase(user, row.caseRecord)}
              onPreview={setPreview}
              onEdit={setEditing}
              onReady={ready}
              onSent={sent}
              onFailed={failed}
              onArchive={archive}
            />
          </>
        )}

        {preview && <MessagePreviewModal row={preview} onClose={() => setPreview(null)} />}
        {editing && (
          <DraftEditModal
            row={editing}
            onClose={() => setEditing(null)}
            onSave={(updates) => {
              saveDraft(editing, updates);
              setEditing(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function DesktopCommunicationTable({ rows, userCanEdit, onPreview, onEdit, onReady, onSent, onFailed, onArchive }: CommunicationActionsProps) {
  return (
    <section className="hidden overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80 xl:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {["Status", "Kanal", "Betreff", "Fallnummer", "Mieter", "Empfänger", "Anhänge", "Letzte Aktivität", "Aktionen"].map((head) => (
              <th key={head} className="px-4 py-3 font-extrabold">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-4 py-4"><CommunicationStatusBadge status={row.message.status} /></td>
              <td className="px-4 py-4 text-slate-300">{channelLabel(row.message.channel)}</td>
              <td className="max-w-[280px] px-4 py-4">
                <div className="font-extrabold text-white">{row.message.subject || row.thread.subject || "-"}</div>
                {row.message.relatedLetterVersionId && <div className="mt-1 text-xs font-semibold text-violet-200">Schreiben verknüpft</div>}
              </td>
              <td className="px-4 py-4"><Link href={`/cases/${row.caseRecord.id}`} className="font-bold text-blue-300 hover:text-blue-200">{row.caseRecord.id}</Link></td>
              <td className="px-4 py-4 text-slate-300">{row.caseRecord.tenant || "-"}</td>
              <td className="max-w-[220px] px-4 py-4 text-slate-400">{formatParticipants(row.message.to) || "-"}</td>
              <td className="px-4 py-4 text-slate-400">{row.message.attachments?.length ?? 0}</td>
              <td className="px-4 py-4 text-slate-400">{formatStoredDate(row.thread.lastMessageAt || row.message.createdAt)}</td>
              <td className="px-4 py-4"><CommunicationActions row={row} canEdit={userCanEdit(row)} onPreview={onPreview} onEdit={onEdit} onReady={onReady} onSent={onSent} onFailed={onFailed} onArchive={onArchive} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-8 text-center text-sm font-semibold text-slate-400">Keine Kommunikation passt zu den Filtern.</div>}
    </section>
  );
}

function MobileCommunicationCards({ rows, userCanEdit, onPreview, onEdit, onReady, onSent, onFailed, onArchive }: CommunicationActionsProps) {
  return (
    <section className="grid gap-3 xl:hidden">
      {rows.map((row) => (
        <article key={row.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-extrabold text-white">{row.message.subject || row.thread.subject || "Nachricht"}</div>
              <div className="mt-1 text-sm text-slate-400">{row.caseRecord.id} · {row.caseRecord.tenant || "-"}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">{formatParticipants(row.message.to) || "Kein Empfänger"}</div>
            </div>
            <CommunicationStatusBadge status={row.message.status} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill label={channelLabel(row.message.channel)} tone="blue" />
            {(row.message.attachments?.length ?? 0) > 0 && <StatusPill label={`${row.message.attachments?.length} Anhänge`} tone="slate" />}
          </div>
          <div className="mt-4">
            <CommunicationActions row={row} canEdit={userCanEdit(row)} onPreview={onPreview} onEdit={onEdit} onReady={onReady} onSent={onSent} onFailed={onFailed} onArchive={onArchive} />
          </div>
        </article>
      ))}
      {rows.length === 0 && <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-8 text-center text-sm font-semibold text-slate-400">Keine Kommunikation passt zu den Filtern.</div>}
    </section>
  );
}

type CommunicationActionsProps = {
  rows: CommunicationRow[];
  userCanEdit: (row: CommunicationRow) => boolean;
  onPreview: (row: CommunicationRow) => void;
  onEdit: (row: CommunicationRow) => void;
  onReady: (row: CommunicationRow) => void;
  onSent: (row: CommunicationRow) => void;
  onFailed: (row: CommunicationRow) => void;
  onArchive: (row: CommunicationRow) => void;
};

function CommunicationActions({ row, canEdit, onPreview, onEdit, onReady, onSent, onFailed, onArchive }: Omit<CommunicationActionsProps, "rows" | "userCanEdit"> & { row: CommunicationRow; canEdit: boolean }) {
  const canEditDraft = row.message.status === "draft" || row.message.status === "ready";
  const canStatusChange = canEdit && row.message.status !== "archived" && row.message.status !== "sent";

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/cases/${row.caseRecord.id}`} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800">Zum Fall</Link>
      <IconButton label="Vorschau" onClick={() => onPreview(row)} icon={<Eye size={14} />} />
      <IconButton label="Bearbeiten" disabled={!canEdit || !canEditDraft} onClick={() => onEdit(row)} icon={<Pencil size={14} />} />
      <IconButton label="Bereit" disabled={!canStatusChange || row.message.status === "ready"} onClick={() => onReady(row)} icon={<CheckCircle2 size={14} />} />
      <IconButton label="Versendet" disabled={!canEdit || row.message.status === "sent" || row.message.status === "archived"} onClick={() => onSent(row)} icon={<Send size={14} />} />
      <IconButton label="Fehler" disabled={!canStatusChange || row.message.status === "failed"} onClick={() => onFailed(row)} icon={<XCircle size={14} />} />
      <IconButton label="Archivieren" disabled={!canEdit || row.message.status === "archived"} onClick={() => onArchive(row)} icon={<Archive size={14} />} />
    </div>
  );
}

function DraftEditModal({ row, onClose, onSave }: { row: CommunicationRow; onClose: () => void; onSave: (updates: DraftUpdates) => void }) {
  const [to, setTo] = useState(formatParticipantsForInput(row.message.to));
  const [cc, setCc] = useState(formatParticipantsForInput(row.message.cc));
  const [bcc, setBcc] = useState(formatParticipantsForInput(row.message.bcc));
  const [subject, setSubject] = useState(row.message.subject ?? "");
  const [bodyText, setBodyText] = useState(row.message.bodyText ?? stripHtml(row.message.bodyHtml) ?? "");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-5 shadow-xl shadow-slate-950/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold text-white">Entwurf bearbeiten</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">{row.caseRecord.id} · lokale Bearbeitung ohne externen Versand</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-bold text-slate-200">Schließen</button>
        </div>
        <div className="mt-5 grid gap-4">
          <DraftField label="An" value={to} onChange={setTo} placeholder="name@example.at, Weitere Person <mail@example.at>" />
          <DraftField label="CC" value={cc} onChange={setCc} />
          <DraftField label="BCC" value={bcc} onChange={setBcc} />
          <DraftField label="Betreff" value={subject} onChange={setSubject} />
          <label>
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-500">Text</span>
            <textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} className="min-h-[260px] w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-3 text-sm leading-6 text-slate-100 outline-none focus:border-blue-500" />
          </label>
          <CommunicationAttachmentList attachments={row.message.attachments ?? []} record={row.caseRecord} />
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-800">Abbrechen</button>
          <button type="button" onClick={() => onSave({ to: parseParticipants(to), cc: parseParticipants(cc), bcc: parseParticipants(bcc), subject, bodyText })} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500">Entwurf speichern</button>
        </div>
      </div>
    </div>
  );
}

function MessagePreviewModal({ row, onClose }: { row: CommunicationRow; onClose: () => void }) {
  const text = row.message.bodyText || stripHtml(row.message.bodyHtml) || "";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold text-white">{row.message.subject || "Nachricht"}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">{row.caseRecord.id} · {formatStoredDate(row.message.createdAt)}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-bold text-slate-200">Schließen</button>
        </div>
        <div className="mt-5 grid gap-2 text-sm">
          <InfoLine label="Von" value={formatParticipant(row.message.from)} />
          <InfoLine label="An" value={formatParticipants(row.message.to)} />
          {row.message.cc?.length ? <InfoLine label="CC" value={formatParticipants(row.message.cc)} /> : null}
        </div>
        <div className="mt-5 whitespace-pre-line rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm leading-7 text-slate-100">{text || "Kein Nachrichtentext gespeichert."}</div>
        <CommunicationAttachmentList attachments={row.message.attachments ?? []} record={row.caseRecord} />
      </div>
    </div>
  );
}

function CommunicationEmptyState() {
  return (
    <section className="rounded-lg border border-dashed border-slate-700 bg-slate-900/80 p-10 text-center">
      <Mail className="mx-auto text-slate-500" size={36} />
      <div className="mt-4 text-xl font-extrabold text-white">Noch keine Kommunikation vorhanden</div>
      <p className="mt-2 text-sm text-slate-400">Erstellen Sie aus einem Schreiben einen E-Mail-Entwurf.</p>
    </section>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: "amber" | "green" | "blue" | "red" | "slate" }) {
  const classes = {
    amber: "text-amber-100",
    green: "text-emerald-200",
    blue: "text-blue-200",
    red: "text-red-200",
    slate: "text-slate-200",
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-extrabold ${classes[tone]}`}>{value}</div>
    </div>
  );
}

function IconButton({ label, icon, disabled, onClick }: { label: string; icon: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600">
      {icon}
      {label}
    </button>
  );
}

function DraftField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100 outline-none focus:border-blue-500" />
    </label>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[90px_1fr]">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold text-slate-300">{value || "-"}</div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "blue" | "slate" }) {
  const classes = {
    blue: "bg-blue-500/10 text-blue-200",
    slate: "bg-slate-800 text-slate-200",
  };
  return <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-extrabold ${classes[tone]}`}>{label}</span>;
}

function collectCommunicationRows(records: SavedCaseRecord[]): CommunicationRow[] {
  return records
    .flatMap((caseRecord) =>
      (caseRecord.communicationThreads ?? []).flatMap((thread) =>
        (thread.messages ?? []).map((message) => ({
          id: `${caseRecord.id}-${thread.id}-${message.id}`,
          caseRecord,
          thread,
          message,
        })),
      ),
    )
    .sort((a, b) => new Date(b.thread.lastMessageAt || b.message.createdAt).getTime() - new Date(a.thread.lastMessageAt || a.message.createdAt).getTime());
}

function matchesFilters(row: CommunicationRow, filters: { query: string; statusFilter: StatusFilter; channelFilter: ChannelFilter; onlyWithAttachments: boolean; onlyFailed: boolean }) {
  const query = filters.query.trim().toLowerCase();
  const haystack = [
    row.caseRecord.id,
    row.caseRecord.tenant,
    row.caseRecord.address,
    row.thread.subject,
    row.message.subject,
    formatParticipants(row.message.to),
  ].join(" ").toLowerCase();

  if (query && !haystack.includes(query)) return false;
  if (filters.statusFilter !== "Alle" && statusLabel(row.message.status) !== filters.statusFilter) return false;
  if (filters.channelFilter !== "Alle" && channelLabel(row.message.channel) !== filters.channelFilter) return false;
  if (filters.onlyWithAttachments && !(row.message.attachments?.length)) return false;
  if (filters.onlyFailed && row.message.status !== "failed") return false;
  return true;
}

function buildStats(rows: CommunicationRow[]) {
  return {
    draft: rows.filter((row) => row.message.status === "draft").length,
    ready: rows.filter((row) => row.message.status === "ready" || row.message.status === "queued" || row.message.status === "received").length,
    sent: rows.filter((row) => row.message.status === "sent").length,
    failed: rows.filter((row) => row.message.status === "failed").length,
    archived: rows.filter((row) => row.message.status === "archived").length,
  };
}

function formatParticipant(participant?: { name?: string; email?: string; role?: string }) {
  if (!participant) return "";
  const label = participant.name || participant.role || "";
  if (label && participant.email) return `${label} <${participant.email}>`;
  return participant.email || label;
}

function formatParticipants(participants?: Array<{ name?: string; email?: string; role?: string }>) {
  return (participants ?? []).map(formatParticipant).filter(Boolean).join(", ");
}

function formatParticipantsForInput(participants?: Array<{ name?: string; email?: string; role?: string }>) {
  return (participants ?? []).map(formatParticipant).filter(Boolean).join(", ");
}

function parseParticipants(value: string): CommunicationParticipant[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.*?)<([^>]+)>$/);
      if (match) return { name: match[1].trim() || undefined, email: match[2].trim(), type: "other" as const };
      const email = item.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
      return email ? { email, type: "other" as const } : { name: item, type: "other" as const };
    });
}

function statusLabel(status: CommunicationMessageStatus): StatusFilter {
  const labels: Record<CommunicationMessageStatus, StatusFilter> = {
    draft: "Entwurf",
    ready: "Bereit",
    queued: "Warteschlange",
    sent: "Versendet",
    failed: "Fehlgeschlagen",
    received: "Empfangen",
    archived: "Archiviert",
  };
  return labels[status];
}

function channelLabel(channel: CommunicationChannel): ChannelFilter {
  if (channel === "email") return "E-Mail";
  if (channel === "internal") return "Intern";
  if (channel === "manual") return "Manuell";
  return "Sonstiges";
}

function stripHtml(value?: string) {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
