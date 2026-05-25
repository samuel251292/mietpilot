"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Eye, FileArchive, FileQuestion, FileText, RefreshCcw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CaseService, CaseServiceAsync } from "@/lib/case-service";
import { visibleCases } from "@/lib/auth";
import { isDocumentReExtractable } from "@/lib/documents/data-url";
import { getDocumentQualityLabel } from "@/lib/documents/document-quality";
import { reExtractSavedDocument } from "@/lib/documents/re-extraction";
import { getFileDownloadSource, getFilePreviewSource, hasFileContent } from "@/lib/storage/file-resolver";
import { useAuth } from "@/lib/use-auth";
import type { SavedCaseDocument, SavedCaseRecord } from "@/types/case";

type DocumentListItem = {
  document: SavedCaseDocument;
  record: SavedCaseRecord;
  caseId: string;
  tenant: string;
};

type DocumentStatusFilter = "all" | "success" | "ocr" | "failed" | "legacy";

export function DocumentListPageClient() {
  const { user, loaded } = useAuth();
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>("all");
  const [previewDocument, setPreviewDocument] = useState<SavedCaseDocument | null>(null);
  const [detailsDocument, setDetailsDocument] = useState<SavedCaseDocument | null>(null);
  const [message, setMessage] = useState("");
  const [reExtractingDocumentId, setReExtractingDocumentId] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const asyncRecords = await CaseServiceAsync.list();
        if (!cancelled) setRecords(asyncRecords);
      } catch (error) {
        console.warn("Async-Dokumentdaten konnten nicht geladen werden. LocalStorage-Fallback wird genutzt.", error);
        const fallbackRecords = CaseService.list();
        if (!cancelled) {
          setRecords(fallbackRecords);
          setLoadError("Dokumente konnten nicht aus dem vorbereiteten Online-Repository geladen werden. Lokale Daten werden angezeigt.");
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

  const scopeRecords = useMemo(() => (user?.role === "admin" ? records : visibleCases(user, records)), [records, user]);

  const documents = useMemo(() => {
    return scopeRecords.flatMap((record) =>
      record.documents.map((document) => ({
        document,
        record,
        caseId: record.id,
        tenant: record.tenant,
      })),
    );
  }, [scopeRecords]);

  const filteredDocuments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((item) => {
      const matchesQuery =
        !needle ||
        [item.document.fileName, item.document.type, item.caseId, item.tenant, item.document.extractionSummary ?? "", getDocumentQualityLabel(item.document)]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return matchesQuery && matchesStatusFilter(item.document, statusFilter);
    });
  }, [documents, query, statusFilter]);

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <DocumentListHeader documentCount={documents.length} />
        <DocumentToolbar query={query} onQueryChange={setQuery} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />
        {(loading || !loaded) && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
            Dokumente werden geladen ...
          </div>
        )}
        {loadError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {loadError}
          </div>
        )}
        {message && <div className="rounded-md bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-100">{message}</div>}

        {documents.length === 0 ? (
          <DocumentsEmptyState />
        ) : filteredDocuments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/55 p-8 text-center text-sm font-semibold text-slate-400">
            Keine Dokumente für die aktuelle Suche gefunden.
          </div>
        ) : (
          <>
            <DocumentTable items={filteredDocuments} onPreview={setPreviewDocument} onDetails={setDetailsDocument} onReExtract={reExtractDocument} reExtractingDocumentId={reExtractingDocumentId} />
            <DocumentMobileCards items={filteredDocuments} onPreview={setPreviewDocument} onDetails={setDetailsDocument} onReExtract={reExtractDocument} reExtractingDocumentId={reExtractingDocumentId} />
          </>
        )}
      </div>
      {previewDocument && <DocumentPreviewModal document={previewDocument} onClose={() => setPreviewDocument(null)} />}
      {detailsDocument && <DocumentExtractionDetailsModal document={detailsDocument} onClose={() => setDetailsDocument(null)} />}
    </div>
  );

  async function reExtractDocument(item: DocumentListItem) {
    setMessage("");
    setReExtractingDocumentId(item.document.id);
    const result = await reExtractSavedDocument(item.record, item.document.id);
    setMessage(`${result.analyzed} Dokument(e) erneut analysiert. ${result.skippedLegacy} Legacy-Dokument(e) übersprungen. ${result.message}`);
    setReExtractingDocumentId("");
  }
}

function DocumentListHeader({ documentCount }: { documentCount: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-blue-300">Dokumentenarchiv</div>
        <h1 className="mt-1 text-3xl font-extrabold text-white">Dokumente</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Hochgeladene Datenblätter, Mietverträge, Richtwert-PDFs und Zusatzdokumente aus gespeicherten Fällen.
        </p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3">
        <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Gespeichert</div>
        <div className="mt-1 text-2xl font-extrabold text-white">{documentCount}</div>
      </div>
    </div>
  );
}

function DocumentToolbar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: DocumentStatusFilter;
  onStatusFilterChange: (value: DocumentStatusFilter) => void;
}) {
  const filters: Array<{ value: DocumentStatusFilter; label: string }> = [
    { value: "all", label: "Alle" },
    { value: "success", label: "Erfolgreich analysiert" },
    { value: "ocr", label: "OCR nötig" },
    { value: "failed", label: "Fehlgeschlagen" },
    { value: "legacy", label: "Legacy" },
  ];

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Dokument, Fallnummer, Mieter oder Typ suchen"
          className="h-11 w-full rounded-md border border-slate-700 bg-slate-950/70 pl-10 pr-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => onStatusFilterChange(filter.value)}
            className={
              statusFilter === filter.value
                ? "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white"
                : "rounded-md border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-extrabold text-slate-300 hover:bg-slate-800"
            }
          >
            {filter.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function DocumentTable({
  items,
  onPreview,
  onDetails,
  onReExtract,
  reExtractingDocumentId,
}: {
  items: DocumentListItem[];
  onPreview: (document: SavedCaseDocument) => void;
  onDetails: (document: SavedCaseDocument) => void;
  onReExtract: (item: DocumentListItem) => void | Promise<void>;
  reExtractingDocumentId: string;
}) {
  return (
    <section className="hidden overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70 md:block">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-950/70 text-xs font-extrabold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Dokumentname</th>
            <th className="px-4 py-3">Dokumenttyp</th>
            <th className="px-4 py-3">Fallnummer</th>
            <th className="px-4 py-3">Mieter</th>
            <th className="px-4 py-3">Upload-Datum</th>
            <th className="px-4 py-3">Größe</th>
            <th className="px-4 py-3">Felder</th>
            <th className="px-4 py-3">Text</th>
            <th className="px-4 py-3">Analyse</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Aktionen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {items.map((item) => (
            <tr key={`${item.caseId}-${item.document.id}`} className="transition hover:bg-slate-900">
              <td className="max-w-[260px] px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-300">
                    <FileText size={19} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-extrabold text-white">{item.document.fileName}</div>
                    {!hasFileContent(item.document) && <div className="mt-1 text-xs font-bold text-amber-300">Datei nicht gespeichert</div>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-4"><DocumentTypeBadge type={item.document.type} /></td>
              <td className="px-4 py-4 font-bold text-blue-200">{item.caseId}</td>
              <td className="px-4 py-4 text-slate-300">{item.tenant || "-"}</td>
              <td className="px-4 py-4 text-slate-300">{formatDocumentDate(item.document.uploadedAt)}</td>
              <td className="px-4 py-4 text-slate-300">{formatDocumentFileSize(item.document.size)}</td>
              <td className="px-4 py-4 text-slate-300">{countExtractedFields(item.document.extractedFields)}</td>
              <td className="px-4 py-4 text-slate-300">{formatExtractedTextLength(item.document.extractedTextLength)}</td>
              <td className="px-4 py-4 text-slate-300">{formatOptionalDocumentDate(item.document.extractedAt)}</td>
              <td className="px-4 py-4"><DocumentExtractionStatusBadge document={item.document} /></td>
              <td className="px-4 py-4">
                <DocumentActions item={item} align="end" onPreview={onPreview} onDetails={onDetails} onReExtract={onReExtract} isReExtracting={reExtractingDocumentId === item.document.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DocumentMobileCards({
  items,
  onPreview,
  onDetails,
  onReExtract,
  reExtractingDocumentId,
}: {
  items: DocumentListItem[];
  onPreview: (document: SavedCaseDocument) => void;
  onDetails: (document: SavedCaseDocument) => void;
  onReExtract: (item: DocumentListItem) => void | Promise<void>;
  reExtractingDocumentId: string;
}) {
  return (
    <section className="grid gap-3 md:hidden">
      {items.map((item) => (
        <article key={`${item.caseId}-${item.document.id}`} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-300">
              <FileText size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="break-words font-extrabold text-white">{item.document.fileName}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <DocumentTypeBadge type={item.document.type} />
                <DocumentExtractionStatusBadge document={item.document} />
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-sm">
            <InfoRow label="Fallnummer" value={item.caseId} />
            <InfoRow label="Mieter" value={item.tenant || "-"} />
            <InfoRow label="Upload" value={formatDocumentDate(item.document.uploadedAt)} />
            <InfoRow label="Größe" value={formatDocumentFileSize(item.document.size)} />
            <InfoRow label="Felder" value={String(countExtractedFields(item.document.extractedFields))} />
            <InfoRow label="Text" value={formatExtractedTextLength(item.document.extractedTextLength)} />
            <InfoRow label="Analyse" value={formatOptionalDocumentDate(item.document.extractedAt)} />
          </div>
          {!hasFileContent(item.document) && <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">Datei nicht gespeichert</div>}
          <div className="mt-4">
            <DocumentActions item={item} onPreview={onPreview} onDetails={onDetails} onReExtract={onReExtract} isReExtracting={reExtractingDocumentId === item.document.id} />
          </div>
        </article>
      ))}
    </section>
  );
}

function DocumentActions({
  item,
  align = "start",
  onPreview,
  onDetails,
  onReExtract,
  isReExtracting,
}: {
  item: DocumentListItem;
  align?: "start" | "end";
  onPreview: (document: SavedCaseDocument) => void;
  onDetails: (document: SavedCaseDocument) => void;
  onReExtract: (item: DocumentListItem) => void | Promise<void>;
  isReExtracting: boolean;
}) {
  const canReExtract = isDocumentReExtractable(item.document);

  return (
    <div className={`flex flex-wrap gap-2 ${align === "end" ? "justify-end" : ""}`}>
      <Button
        type="button"
        variant="secondary"
        className="h-9 border-slate-700 bg-slate-950/70 px-3 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!canReExtract || isReExtracting}
        title={canReExtract ? "Dokument neu analysieren" : "Dateiinhalt nicht gespeichert"}
        onClick={() => void onReExtract(item)}
      >
        <RefreshCcw size={14} />
        {isReExtracting ? "Analysiert..." : "Neu analysieren"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="h-9 border-slate-700 bg-slate-950/70 px-3 text-xs text-slate-100 hover:bg-slate-800"
        onClick={() => onDetails(item.document)}
      >
        Details
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="h-9 border-slate-700 bg-slate-950/70 px-3 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!hasFileContent(item.document)}
        onClick={() => onPreview(item.document)}
      >
        <Eye size={14} />
        Vorschau
      </Button>
      <Button asChild variant="secondary" className="h-9 border-slate-700 bg-slate-950/70 px-3 text-xs text-slate-100 hover:bg-slate-800">
        <Link href={`/cases/${item.caseId}`}>
          <ExternalLink size={14} />
          Zum Fall
        </Link>
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="h-9 border-slate-700 bg-slate-950/70 px-3 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!hasFileContent(item.document)}
        onClick={() => downloadSavedDocument(item.document)}
      >
        <Download size={14} />
        Download
      </Button>
    </div>
  );
}

function DocumentsEmptyState() {
  return (
    <section className="rounded-lg border border-dashed border-slate-700 bg-slate-900/55 p-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-slate-950 text-slate-400">
        <FileArchive size={26} />
      </div>
      <h2 className="mt-4 text-lg font-extrabold text-white">Noch keine Dokumente gespeichert</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
        Sobald ein Fall mit Upload-Dokumenten gespeichert wird, erscheint er hier im Archiv.
      </p>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function matchesStatusFilter(document: SavedCaseDocument, filter: DocumentStatusFilter) {
  if (filter === "all") return true;
  if (filter === "legacy") return !hasFileContent(document);
  if (filter === "success") return document.extractionStatus === "success";
  if (filter === "failed") return document.extractionStatus === "failed" && !document.extractionWarnings?.some((warning) => /ocr/i.test(warning));
  if (filter === "ocr") return document.extractionWarnings?.some((warning) => /ocr/i.test(warning)) ?? false;
  return true;
}

export function DocumentTypeBadge({ type }: { type: SavedCaseDocument["type"] }) {
  return <span className="inline-flex rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-extrabold text-blue-200">{type}</span>;
}

export function DocumentExtractionStatusBadge({ document }: { document: SavedCaseDocument }) {
  if (!hasFileContent(document)) {
    return <span className="inline-flex rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-extrabold text-amber-200">Datei nicht gespeichert</span>;
  }

  if (document.extractionStatus === "pending") {
    return <span className="inline-flex rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-extrabold text-blue-200">Ausstehend</span>;
  }

  if (document.extractionStatus === "success") {
    const label = getDocumentQualityLabel(document);
    return <span className="inline-flex rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-extrabold text-emerald-200">{label}</span>;
  }

  if (document.extractionStatus === "failed") {
    return <span className="inline-flex rounded-md bg-red-500/10 px-2.5 py-1 text-xs font-extrabold text-red-200">{getDocumentQualityLabel(document)}</span>;
  }

  if (document.extractionStatus === "not_applicable") {
    return <span className="inline-flex rounded-md bg-slate-800 px-2.5 py-1 text-xs font-extrabold text-slate-300">Nicht anwendbar</span>;
  }

  return <span className="inline-flex rounded-md bg-slate-800 px-2.5 py-1 text-xs font-extrabold text-slate-300">Gespeichert</span>;
}

export function downloadSavedDocument(document: SavedCaseDocument) {
  const source = getFileDownloadSource(document);
  if (!source) return;
  const link = window.document.createElement("a");
  link.href = source;
  link.download = document.fileName;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
}

export function DocumentPreviewModal({ document, onClose }: { document: SavedCaseDocument; onClose: () => void }) {
  const previewKind = getPreviewKind(document);
  const previewSource = getFilePreviewSource(document);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <section className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-2xl shadow-slate-950/50">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 p-4">
          <div className="min-w-0">
            <div className="text-xs font-extrabold uppercase tracking-wide text-blue-300">Dokument-Vorschau</div>
            <h2 className="mt-1 break-words text-lg font-extrabold text-white">{document.fileName}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <DocumentTypeBadge type={document.type} />
              <DocumentExtractionStatusBadge document={document} />
              <span className="inline-flex rounded-md bg-slate-800 px-2.5 py-1 text-xs font-extrabold text-slate-300">{formatDocumentFileSize(document.size)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-9 border-slate-700 bg-slate-950/70 px-3 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasFileContent(document)}
              onClick={() => downloadSavedDocument(document)}
            >
              <Download size={14} />
              Download
            </Button>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 bg-slate-950/70 text-slate-300 transition hover:bg-slate-800 hover:text-white">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-950 p-4">
          {!previewSource ? (
            <PreviewNotice title="Dateiinhalt nicht gespeichert" text="Dieses Legacy-Dokument enthält nur Metadaten. Bitte laden Sie die Datei im Fall erneut hoch, um Vorschau und Download zu nutzen." />
          ) : previewKind === "pdf" ? (
            <iframe title={document.fileName} src={previewSource} className="h-[72vh] w-full rounded-md border border-slate-800 bg-white" />
          ) : previewKind === "image" ? (
            <div className="grid min-h-[60vh] place-items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSource} alt={document.fileName} className="max-h-[72vh] max-w-full rounded-md border border-slate-800 object-contain" />
            </div>
          ) : (
            <PreviewNotice title="Keine Vorschau verfügbar" text="Dieser Dateityp kann hier nicht eingebettet angezeigt werden. Der Download steht bereit." />
          )}
        </div>
      </section>
    </div>
  );
}

export function DocumentExtractionDetailsModal({ document, onClose }: { document: SavedCaseDocument; onClose: () => void }) {
  const fields = Object.entries(document.extractedFields ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== "" && value !== 0);
  const warnings = document.extractionWarnings ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-2xl shadow-slate-950/50">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
          <div className="min-w-0">
            <div className="text-xs font-extrabold uppercase tracking-wide text-blue-300">Extraktionsdetails</div>
            <h2 className="mt-1 break-words text-lg font-extrabold text-white">{document.fileName}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <DocumentExtractionStatusBadge document={document} />
              <span className="inline-flex rounded-md bg-slate-800 px-2.5 py-1 text-xs font-extrabold text-slate-300">{countExtractedFields(document.extractedFields)} Feld(er)</span>
              <span className="inline-flex rounded-md bg-slate-800 px-2.5 py-1 text-xs font-extrabold text-slate-300">{formatExtractedTextLength(document.extractedTextLength)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-700 bg-slate-950/70 text-slate-300 transition hover:bg-slate-800 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[72vh] overflow-auto p-4">
          {!hasFileContent(document) && (
            <div className="mb-4 rounded-md bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-200">Dateiinhalt nicht gespeichert - erneute Analyse nicht möglich.</div>
          )}
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <DetailMetric label="Analysiert" value={formatOptionalDocumentDate(document.extractedAt)} />
            <DetailMetric label="Textlänge" value={formatExtractedTextLength(document.extractedTextLength)} />
            <DetailMetric label="Felder" value={String(fields.length)} />
          </div>
          {document.extractionError && <div className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm font-bold text-red-200">{document.extractionError}</div>}
          {warnings.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Warnungen</h3>
              <div className="mt-2 grid gap-2">
                {warnings.map((warning) => (
                  <div key={warning} className="rounded-md bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">{warning}</div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Erkannte Felder</h3>
            {fields.length === 0 ? (
              <div className="mt-2 rounded-md border border-dashed border-slate-700 p-4 text-sm font-semibold text-slate-400">Keine Felder gespeichert.</div>
            ) : (
              <div className="mt-2 grid gap-2">
                {fields.map(([key, value]) => (
                  <div key={key} className="grid gap-1 rounded-md border border-slate-800 bg-slate-950/45 p-3 md:grid-cols-[180px_1fr]">
                    <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{key}</div>
                    <div className="break-words font-semibold text-slate-100">{formatFieldValue(value)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/45 p-3">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-extrabold text-white">{value}</div>
    </div>
  );
}

function PreviewNotice({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid min-h-[46vh] place-items-center">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-slate-900 text-slate-400">
          <FileQuestion size={26} />
        </div>
        <h3 className="mt-4 text-lg font-extrabold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
      </div>
    </div>
  );
}

function getPreviewKind(document: SavedCaseDocument) {
  const mimeType = document.mimeType?.toLowerCase() ?? "";
  const fileName = document.fileName.toLowerCase();

  if (mimeType.includes("pdf") || fileName.endsWith(".pdf")) return "pdf";
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName)) return "image";
  return "unsupported";
}

export function formatDocumentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function formatOptionalDocumentDate(value?: string) {
  return value ? formatDocumentDate(value) : "-";
}

export function formatDocumentFileSize(size?: number) {
  if (!size || size <= 0) return "-";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function countExtractedFields(fields?: Record<string, unknown>) {
  if (!fields) return 0;
  return Object.values(fields).filter((value) => value !== undefined && value !== null && value !== "" && value !== 0).length;
}

export function formatExtractedTextLength(value?: number) {
  if (!value || value <= 0) return "-";
  return `${value.toLocaleString("de-AT")} Zeichen`;
}

function formatFieldValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "number") return value.toLocaleString("de-AT");
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
