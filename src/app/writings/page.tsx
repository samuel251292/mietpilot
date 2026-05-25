"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, Download, Eye, FileText, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LetterDocumentPreview } from "@/components/cases/letter-document-preview";
import { canEditCase, visibleCases } from "@/lib/auth";
import { CaseService, CaseServiceAsync, formatStoredDate } from "@/lib/case-service";
import { archiveLetterVersion, markLetterVersionSent } from "@/lib/letters/letter-versioning";
import { fileToBlob, hasFileContent } from "@/lib/storage/file-resolver";
import { renderTemplate } from "@/lib/template";
import { defaultTemplate } from "@/lib/template";
import { downloadBlob } from "@/lib/word-templates";
import { useAuth } from "@/lib/use-auth";
import type { GeneratedLetterVersion, SavedCaseRecord, SavedGeneratedFile } from "@/types/case";

type WritingRow = {
  id: string;
  caseRecord: SavedCaseRecord;
  letter: GeneratedLetterVersion;
  legacy: boolean;
};

const statusFilters = [
  "Alle",
  "Entwurf",
  "Prüfung erforderlich",
  "Bereit",
  "Freigegeben",
  "Versendet",
  "Archiviert",
  "Veraltet",
] as const;

const reviewFilters = ["Alle", "Ready", "Warning", "Review erforderlich"] as const;

export default function WritingsPage() {
  const { user, loaded } = useAuth();
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]>("Alle");
  const [reviewFilter, setReviewFilter] = useState<(typeof reviewFilters)[number]>("Alle");
  const [onlyOutdated, setOnlyOutdated] = useState(false);
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [preview, setPreview] = useState<WritingRow | null>(null);
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
        console.warn("Async-Schreibenfälle konnten nicht geladen werden. LocalStorage-Fallback wird genutzt.", error);
        const fallbackRecords = CaseService.list();
        if (!cancelled) {
          setRecords(fallbackRecords);
          setLoadError("Schreiben konnten nicht aus dem vorbereiteten Online-Repository geladen werden. Lokale Daten werden angezeigt.");
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

  const rows = useMemo(() => collectWritingRows(visibleCases(user, records)), [records, user]);
  const filteredRows = useMemo(
    () => rows.filter((row) => matchesFilters(row, { query, statusFilter, reviewFilter, onlyOutdated, onlyApproved })),
    [rows, query, statusFilter, reviewFilter, onlyOutdated, onlyApproved],
  );

  function updateLetter(row: WritingRow, nextLetter: GeneratedLetterVersion, activityTitle: string) {
    if (!canEditCase(user, row.caseRecord)) return;
    const now = new Date().toISOString();
    const saved = CaseService.save(
      {
        ...row.caseRecord,
        generatedLetters: (row.caseRecord.generatedLetters ?? []).map((letter) => (letter.id === row.letter.id ? nextLetter : letter)),
        updatedAt: now,
        lastActivity: formatStoredDate(now),
      },
      { actor: user, skipAutoActivity: true, activity: CaseService.buildActivity("letter_generated", activityTitle, { actor: user, metadata: { version: row.letter.version, status: nextLetter.status } }) },
    );
    setRecords((current) => current.map((record) => (record.id === saved.id ? saved : record)));
  }

  function archive(row: WritingRow) {
    updateLetter(row, archiveLetterVersion(row.letter, { changedBy: user?.id, changedByName: user?.name }), "Schreiben archiviert");
  }

  function markSent(row: WritingRow) {
    const force = Boolean(row.letter.approval?.approvedAt) || window.confirm("Dieses Schreiben ist noch nicht freigegeben. Trotzdem als versendet markieren?");
    if (!force) return;
    updateLetter(row, markLetterVersionSent(row.letter, { sentBy: user?.id, sentByName: user?.name, method: "manual", force }), "Schreiben als versendet markiert");
  }

  if (!loaded) return null;

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Schreiben</h1>
            <p className="mt-1 text-sm text-slate-400">Echte Vergleichsschreiben-Versionen aus gespeicherten Fällen.</p>
          </div>
          <Link href="/cases/new" className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500">
            Neuen Fall erstellen
          </Link>
        </div>

        {loadingRecords && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
            Schreiben werden geladen ...
          </div>
        )}
        {loadError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {loadError}
          </div>
        )}

        <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="grid gap-3 xl:grid-cols-[1fr_180px_180px_auto_auto]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Fallnummer, Mieter, Adresse, Vorlage suchen"
                className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm font-semibold text-white outline-none focus:border-blue-500"
              />
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white">
              {statusFilters.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as typeof reviewFilter)} className="h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white">
              {reviewFilters.map((status) => <option key={status}>{status}</option>)}
            </select>
            <label className="flex h-11 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-bold text-slate-200">
              <input type="checkbox" checked={onlyOutdated} onChange={(event) => setOnlyOutdated(event.target.checked)} />
              Nur veraltete
            </label>
            <label className="flex h-11 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-bold text-slate-200">
              <input type="checkbox" checked={onlyApproved} onChange={(event) => setOnlyApproved(event.target.checked)} />
              Nur freigegebene
            </label>
          </div>
        </section>

        {rows.length === 0 ? (
          <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-10 text-center">
            <FileText className="mx-auto text-slate-500" size={36} />
            <div className="mt-4 text-xl font-extrabold text-white">Noch keine Schreiben vorhanden</div>
            <p className="mt-2 text-sm text-slate-400">Erstellen Sie einen Fall und generieren Sie ein Vergleichsschreiben.</p>
            <Link href="/cases/new" className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500">
              Neuen Fall erstellen
            </Link>
          </section>
        ) : (
          <>
            <DesktopWritingTable rows={filteredRows} userCanEdit={(row) => canEditCase(user, row.caseRecord)} onPreview={setPreview} onArchive={archive} onSent={markSent} />
            <MobileWritingCards rows={filteredRows} userCanEdit={(row) => canEditCase(user, row.caseRecord)} onPreview={setPreview} onArchive={archive} onSent={markSent} />
          </>
        )}

        {preview && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg border border-slate-800 bg-white">
              <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                <div className="font-extrabold text-navy-950">{preview.caseRecord.id} · Version {preview.letter.version}</div>
                <button type="button" onClick={() => setPreview(null)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-bold text-navy-950">Schließen</button>
              </div>
              <LetterDocumentPreview content={preview.letter.letterText || preview.caseRecord.letterText || ""} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DesktopWritingTable({ rows, userCanEdit, onPreview, onArchive, onSent }: WritingActionsProps) {
  return (
    <section className="hidden overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80 xl:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {["Version", "Fall", "Mieter", "Adresse", "Status", "Review", "Vorlage", "Erstellt", "Freigabe", "Versand", "Veraltet", "Aktionen"].map((head) => (
              <th key={head} className="px-4 py-3 font-extrabold">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-4 py-4 font-extrabold text-white">V{row.letter.version}</td>
              <td className="px-4 py-4"><Link className="font-bold text-blue-300 hover:text-blue-200" href={`/cases/${row.caseRecord.id}`}>{row.caseRecord.id}</Link></td>
              <td className="px-4 py-4 text-slate-200">{row.caseRecord.tenant || "-"}</td>
              <td className="max-w-[220px] px-4 py-4 text-slate-400">{row.caseRecord.address || "-"}</td>
              <td className="px-4 py-4"><StatusPill label={statusLabel(row)} tone={statusTone(row)} /></td>
              <td className="px-4 py-4"><StatusPill label={reviewLabel(row)} tone={reviewTone(row)} /></td>
              <td className="px-4 py-4 text-slate-400">{row.letter.templateFileName ?? row.letter.templateName ?? (row.legacy ? "Legacy" : "-")}</td>
              <td className="px-4 py-4 text-slate-400">{formatStoredDate(row.letter.createdAt)}</td>
              <td className="px-4 py-4 text-slate-400">{row.letter.approval?.approvedAt ? formatStoredDate(row.letter.approval.approvedAt) : "-"}</td>
              <td className="px-4 py-4 text-slate-400">{row.letter.sent?.sentAt ? formatStoredDate(row.letter.sent.sentAt) : "-"}</td>
              <td className="px-4 py-4 text-slate-400">{row.letter.outdated ? "Ja" : "Nein"}</td>
              <td className="px-4 py-4"><WritingActions row={row} canEdit={userCanEdit(row)} onPreview={onPreview} onArchive={onArchive} onSent={onSent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-8 text-center text-sm font-semibold text-slate-400">Keine Schreiben passen zu den Filtern.</div>}
    </section>
  );
}

function MobileWritingCards({ rows, userCanEdit, onPreview, onArchive, onSent }: WritingActionsProps) {
  return (
    <section className="grid gap-3 xl:hidden">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-extrabold text-white">{row.caseRecord.id} · Version {row.letter.version}</div>
              <div className="mt-1 text-sm text-slate-400">{row.caseRecord.tenant}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">{row.caseRecord.address}</div>
            </div>
            <StatusPill label={statusLabel(row)} tone={statusTone(row)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill label={reviewLabel(row)} tone={reviewTone(row)} />
            {row.letter.outdated && <StatusPill label="Veraltet" tone="amber" />}
            {row.legacy && <StatusPill label="Legacy" tone="slate" />}
          </div>
          <div className="mt-4">
            <WritingActions row={row} canEdit={userCanEdit(row)} onPreview={onPreview} onArchive={onArchive} onSent={onSent} />
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-8 text-center text-sm font-semibold text-slate-400">Keine Schreiben passen zu den Filtern.</div>}
    </section>
  );
}

type WritingActionsProps = {
  rows: WritingRow[];
  userCanEdit: (row: WritingRow) => boolean;
  onPreview: (row: WritingRow) => void;
  onArchive: (row: WritingRow) => void;
  onSent: (row: WritingRow) => void;
};

function WritingActions({ row, canEdit, onPreview, onArchive, onSent }: Omit<WritingActionsProps, "rows" | "userCanEdit"> & { row: WritingRow; canEdit: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/cases/${row.caseRecord.id}`} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800">Zum Fall</Link>
      <IconButton label="Vorschau" onClick={() => onPreview(row)} icon={<Eye size={14} />} />
      <DownloadAction file={row.letter.docx} label="DOCX" />
      <DownloadAction file={row.letter.pdf} label="PDF" />
      <IconButton label="Versendet" disabled={!canEdit || row.legacy} onClick={() => onSent(row)} icon={<Send size={14} />} />
      <IconButton label="Archivieren" disabled={!canEdit || row.legacy || row.letter.status === "archived"} onClick={() => onArchive(row)} icon={<Archive size={14} />} />
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

function DownloadAction({ file, label }: { file?: SavedGeneratedFile; label: string }) {
  return (
    <button
      type="button"
      disabled={!hasFileContent(file)}
      onClick={async () => {
        const blob = await fileToBlob(file);
        if (blob && file?.fileName) downloadBlob(blob, file.fileName);
      }}
      className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600"
    >
      <Download size={14} />
      {label}
    </button>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "amber" | "red" | "blue" | "slate" }) {
  const classes = {
    green: "bg-emerald-500/10 text-emerald-200",
    amber: "bg-amber-500/10 text-amber-100",
    red: "bg-red-500/10 text-red-200",
    blue: "bg-blue-500/10 text-blue-200",
    slate: "bg-slate-800 text-slate-200",
  };
  return <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-extrabold ${classes[tone]}`}>{label}</span>;
}

function collectWritingRows(records: SavedCaseRecord[]): WritingRow[] {
  return records.flatMap((record) => {
    const versions = (record.generatedLetters ?? []).map((letter) => ({ id: `${record.id}-${letter.id}`, caseRecord: record, letter, legacy: false }));
    if (versions.length > 0) return versions;
    if (!record.generatedWord && !record.generatedPdf && !record.letterText) return [];
    return [{
      id: `${record.id}-legacy-letter`,
      caseRecord: record,
      legacy: true,
      letter: {
        id: "legacy-letter",
        version: 1,
        createdAt: record.generatedPdf?.generatedAt ?? record.generatedWord?.generatedAt ?? record.updatedAt,
        status: "generated",
        title: "Legacy Vergleichsschreiben",
        templateName: "Legacy",
        templateFileName: "Legacy",
        letterText: record.letterText || renderTemplate(defaultTemplate, record),
        docx: record.generatedWord,
        pdf: record.generatedPdf,
        outdated: false,
        warnings: ["Legacy-Eintrag aus älterer Speicherung."],
      } satisfies GeneratedLetterVersion,
    }];
  }).sort((a, b) => new Date(b.letter.createdAt).getTime() - new Date(a.letter.createdAt).getTime());
}

function matchesFilters(row: WritingRow, filters: { query: string; statusFilter: string; reviewFilter: string; onlyOutdated: boolean; onlyApproved: boolean }) {
  const query = filters.query.trim().toLowerCase();
  const haystack = [row.caseRecord.id, row.caseRecord.tenant, row.caseRecord.address, row.letter.templateFileName, row.letter.templateName].join(" ").toLowerCase();
  if (query && !haystack.includes(query)) return false;
  if (filters.statusFilter !== "Alle" && statusLabel(row) !== filters.statusFilter) return false;
  if (filters.reviewFilter !== "Alle" && reviewLabel(row) !== filters.reviewFilter) return false;
  if (filters.onlyOutdated && !row.letter.outdated && row.letter.status !== "outdated") return false;
  if (filters.onlyApproved && !row.letter.approval?.approvedAt) return false;
  return true;
}

function statusLabel(row: WritingRow) {
  if (row.letter.outdated || row.letter.status === "outdated") return "Veraltet";
  if (row.letter.status === "archived") return "Archiviert";
  if (row.letter.sent?.sentAt || row.letter.status === "sent") return "Versendet";
  if (row.letter.approval?.approvedAt) return "Freigegeben";
  if (row.letter.status === "ready") return "Bereit";
  if (row.letter.status === "review") return "Prüfung erforderlich";
  if (row.letter.status === "draft") return "Entwurf";
  return "Bereit";
}

function reviewLabel(row: WritingRow) {
  const status = row.letter.review?.status;
  if (status === "ready" || status === "approved") return "Ready";
  if (status === "warning") return "Warning";
  if (status === "review_required") return "Review erforderlich";
  if (row.letter.status === "review") return "Review erforderlich";
  return "Ready";
}

function statusTone(row: WritingRow): "green" | "amber" | "red" | "blue" | "slate" {
  const label = statusLabel(row);
  if (label === "Freigegeben" || label === "Bereit") return "green";
  if (label === "Versendet") return "blue";
  if (label === "Prüfung erforderlich" || label === "Veraltet") return "amber";
  if (label === "Archiviert") return "slate";
  return "slate";
}

function reviewTone(row: WritingRow): "green" | "amber" | "red" | "blue" | "slate" {
  const label = reviewLabel(row);
  if (label === "Ready") return "green";
  if (label === "Review erforderlich") return "red";
  if (label === "Warning") return "amber";
  return "slate";
}
