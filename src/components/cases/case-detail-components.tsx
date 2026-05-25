"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  CircleDot,
  Download,
  Eye,
  FileCheck2,
  FileText,
  FolderOpen,
  Home,
  Pencil,
  RefreshCcw,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { LetterDocumentPreview } from "@/components/cases/letter-document-preview";
import {
  DocumentExtractionStatusBadge,
  DocumentPreviewModal,
  DocumentTypeBadge,
  countExtractedFields,
  downloadSavedDocument,
  formatExtractedTextLength,
  formatDocumentDate,
  formatDocumentFileSize,
  formatOptionalDocumentDate,
} from "@/components/documents/document-list-components";
import { isDocumentReExtractable } from "@/lib/documents/data-url";
import { getDocumentQuality } from "@/lib/documents/document-quality";
import { reExtractSavedDocument } from "@/lib/documents/re-extraction";
import { fileToBlob, hasFileContent } from "@/lib/storage/file-resolver";
import { buildStorageReadyGeneratedFile } from "@/lib/storage/generated-file-storage";
import { canEditCase, canShareCase, type PublicUser } from "@/lib/auth";
import { CaseService, formatStoredDate } from "@/lib/case-service";
import { createLetterEmailDraft, listThreads } from "@/lib/communication/communication-service";
import { buildCalculationReport } from "@/lib/calculation";
import { renderCalculationReportAsHtml, renderCalculationReportAsText } from "@/lib/calculation/report-renderer";
import { generateCalculationReportDocx, generateCalculationReportPdf } from "@/lib/calculation/report-export";
import { createTemplateValues } from "@/lib/template";
import { toDocxTemplateData } from "@/lib/letters/letter-data";
import { appendGeneratedLetterVersion, approveLetterVersion, archiveLetterVersion, createGeneratedLetterVersion, getNextLetterVersion, markLetterVersionSent, markOutdatedGeneratedLetters, updateLetterVersionStatus } from "@/lib/letters/letter-versioning";
import { buildLetterAttachments } from "@/lib/letters/legal-letter-structure";
import { buildLetterReview } from "@/lib/letters/letter-review";
import { downloadBlob, loadActiveStoredWordTemplate } from "@/lib/word-templates";
import { useAuth } from "@/lib/use-auth";
import { formatCurrency } from "@/lib/utils";
import type { CalculationReport, CalculationResult, CaseActivity, CaseActivityType, GeneratedLetterVersion, LetterAttachment, LetterReview, SavedCaseDocument, SavedCaseRecord } from "@/types/case";

export const caseDetailTabs = ["Übersicht", "Dokumente", "Erkannte Daten", "Berechnung", "Vergleichsschreiben", "Kommunikation", "Aufgaben", "Termine", "Export"] as const;
export type CaseDetailTab = (typeof caseDetailTabs)[number];

type HeaderActions = {
  onShare: () => void;
  onComplete: () => void;
  onDelete: () => void;
};

export function CaseDetailHeader({
  record,
  user,
  actions,
}: {
  record: SavedCaseRecord;
  user: PublicUser | null;
  actions: HeaderActions;
}) {
  const canEdit = canEditCase(user, record);
  const canShare = canShareCase(user, record);
  const isSharedWithMe = Boolean(user && record.ownerId !== user.id && (record.sharedWith ?? []).some((share) => share.userId === user.id));

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-sm shadow-slate-950/30">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold leading-tight text-white">{record.id}</h1>
            <StatusBadge status={record.status} />
            {isSharedWithMe && <span className="rounded-md bg-violet-500/10 px-2 py-1 text-xs font-bold text-violet-200">Geteilt mit mir</span>}
          </div>
          <div className="mt-3 text-xl font-extrabold text-white">{record.tenant || "Mieter fehlt"}</div>
          <div className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{record.address || "Adresse fehlt"}</div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-400">
            <span className="rounded-md border border-slate-800 bg-slate-950/45 px-2.5 py-1.5">{record.ownerName ?? "Nicht zugewiesen"}</span>
            <span className="rounded-md border border-slate-800 bg-slate-950/45 px-2.5 py-1.5">Geändert {formatStoredDate(record.updatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
          <HeaderActionLink href={`/cases/${record.id}/edit`} disabled={!canEdit}>
            <Pencil size={15} />
            Bearbeiten
          </HeaderActionLink>
          {canShare && (
            <HeaderActionButton onClick={actions.onShare}>
              <Share2 size={15} />
              Teilen
            </HeaderActionButton>
          )}
          <HeaderActionButton onClick={actions.onComplete} disabled={!canEdit || record.status === "Abgeschlossen"}>
            <CheckCircle2 size={15} />
            Abschließen
          </HeaderActionButton>
          <HeaderActionButton onClick={actions.onDelete} disabled={!canEdit} danger>
            <Trash2 size={15} />
            Löschen
          </HeaderActionButton>
        </div>
      </div>
    </section>
  );
}

export function CaseQuickStats({ record }: { record: SavedCaseRecord }) {
  const calculation = record.calculation;
  const stats = [
    { label: "Forderung gesamt", value: moneyOrMissing(record.claimAmount, "Nicht berechnet"), tone: "blue" },
    { label: "Monatliche Überschreitung", value: moneyOrMissing(calculation?.monthlyExcess, "Nicht berechnet"), tone: "red" },
    { label: "Aktuelle Miete", value: moneyOrMissing(calculation?.currentGrossRent, "Fehlt"), tone: "slate" },
    { label: "Erlaubte Miete", value: moneyOrMissing(calculation?.allowedGrossRent, "Fehlt"), tone: "green" },
    { label: "Vergleichsbetrag", value: moneyOrMissing(calculation?.settlementAmount, "Nicht berechnet"), tone: "orange" },
    { label: "Dokumente", value: record.documents.length > 0 ? String(record.documents.length) : "Fehlt", tone: "violet" },
  ];

  return (
    <section className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => (
        <div key={stat.label} className="flex min-h-[124px] flex-col rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{stat.label}</div>
          <div className={stat.value === "Fehlt" || stat.value === "Nicht berechnet" ? "mt-auto text-lg font-extrabold text-slate-400" : `mt-auto text-2xl font-extrabold ${statToneClass(stat.tone)}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </section>
  );
}

export function CasePartiesPanel({ record }: { record: SavedCaseRecord }) {
  const data = record.extracted;
  return (
    <Panel title="Parteien und Objekt" icon={<Users size={18} />}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoTile label="Mieter" value={data.tenantName || record.tenant} />
        <InfoTile label="Empfänger/Vermieter" value={data.recipientName || data.landlord} />
        <InfoTile label="Vertretung" value={data.representation || data.landlordRepresentedBy} />
        <InfoTile label="Wohnungsadresse" value={data.tenantFullAddress || record.address} />
        <InfoTile label="Nutzfläche Vertrag" value={numberWithUnit(data.nutzflaeche_laut_vertrag || data.contractArea, "m²")} />
        <InfoTile label="Nutzfläche nachgemessen" value={numberWithUnit(data.nutzflaeche_nachgemessen || data.measuredArea, "m²")} />
        <InfoTile label="Kategorie" value={data.category} />
        <InfoTile label="Mietbeginn" value={data.leaseStart || data.moveInDate} />
      </div>
    </Panel>
  );
}

export function CaseWorkflowTimeline({ record }: { record: SavedCaseRecord }) {
  const steps = getWorkflowSteps(record);

  return (
    <Panel title="Workflow" icon={<CheckCircle2 size={18} />}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {steps.map((step, index) => (
          <div key={step.label} className="relative rounded-lg border border-slate-800 bg-slate-950/35 p-3">
            <div className={step.done ? "grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300" : "grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-slate-500"}>
              {step.done ? <CheckCircle2 size={16} /> : <span className="text-xs font-extrabold">{index + 1}</span>}
            </div>
            <div className="mt-3 text-sm font-extrabold text-white">{step.label}</div>
            <div className={step.done ? "mt-1 text-xs font-bold text-emerald-300" : "mt-1 text-xs font-bold text-slate-500"}>{step.done ? "Erledigt" : "Offen"}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function CaseTabsShell({
  activeTab,
  onTabChange,
  children,
}: {
  activeTab: CaseDetailTab;
  onTabChange: (tab: CaseDetailTab) => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70">
      <div className="flex gap-2 overflow-x-auto border-b border-slate-800 p-3">
        {caseDetailTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={
              activeTab === tab
                ? "shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm font-bold text-white"
                : "shrink-0 rounded-md border border-slate-800 bg-slate-950/35 px-3 py-2 text-sm font-bold text-slate-400 transition hover:text-slate-200"
            }
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

export function CaseDocumentsPanel({ record, onRecordChange }: { record: SavedCaseRecord; onRecordChange?: (record: SavedCaseRecord) => void }) {
  const [previewDocument, setPreviewDocument] = useState<SavedCaseDocument | null>(null);
  const [message, setMessage] = useState("");
  const [reExtractingDocumentId, setReExtractingDocumentId] = useState("");
  const { user } = useAuth();
  const quality = getDocumentQuality(record);

  if (record.documents.length === 0) {
    return <EmptyPanel icon={<FolderOpen size={24} />} title="Keine Dokumente gespeichert" text="Sobald Datenblatt, Mietvertrag, Richtwert oder Gutachten hochgeladen wurden, erscheinen sie hier." />;
  }

  return (
    <>
      <Panel title="Dokumente" icon={<FolderOpen size={18} />}>
        {message && <div className="mb-4 rounded-md bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-100">{message}</div>}
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/35 p-4">
          <div className="text-sm font-extrabold text-white">Dokumentenprüfung</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <QualityBadge ok={quality.complete} label={quality.complete ? "Unterlagen vollständig" : "Pflichtdokumente fehlen"} />
            <QualityBadge ok={quality.readyForCalculation} label={quality.readyForCalculation ? "Berechnung bereit" : "Analyse prüfen"} />
            {quality.needsReview && <QualityBadge ok={false} label="Ungeprüfte Hinweise" />}
            {quality.exportOutdated && <QualityBadge ok={false} label="Export veraltet" />}
            {Object.entries(quality.requiredDocuments).map(([type, status]) => (
              <QualityBadge key={type} ok={status === "erfolgreich analysiert"} label={`${type}: ${status}`} />
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {record.documents.map((document) => {
            const canReExtract = isDocumentReExtractable(document);
            const isReExtracting = reExtractingDocumentId === document.id;

            return (
            <div key={document.id} className="rounded-lg border border-slate-800 bg-slate-950/35 p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-300">
                  <FileText size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-extrabold text-white">{document.fileName}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <DocumentTypeBadge type={document.type} />
                    <DocumentExtractionStatusBadge document={document} />
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm">
                <DocumentInfoRow label="Upload" value={formatDocumentDate(document.uploadedAt)} />
                <DocumentInfoRow label="Größe" value={formatDocumentFileSize(document.size)} />
                <DocumentInfoRow label="Erkannte Felder" value={String(countExtractedFields(document.extractedFields))} />
                <DocumentInfoRow label="Textlänge" value={formatExtractedTextLength(document.extractedTextLength)} />
                <DocumentInfoRow label="Analyse" value={formatOptionalDocumentDate(document.extractedAt)} />
              </div>

              {!hasFileContent(document) && (
                <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">
                  Legacy-Dokument: Dateiinhalt nicht gespeichert - erneute Analyse nicht möglich.
                </div>
              )}
              {document.extractionError && (
                <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200">{document.extractionError}</div>
              )}
              {(document.extractionWarnings ?? []).length > 0 && (
                <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100">
                  {document.extractionWarnings?.[0]}
                  {(document.extractionWarnings?.length ?? 0) > 1 ? ` +${(document.extractionWarnings?.length ?? 1) - 1}` : ""}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 border-slate-700 bg-slate-950/70 px-3 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!canReExtract || isReExtracting}
                  title={canReExtract ? "Dokument neu analysieren" : "Dateiinhalt nicht gespeichert"}
                  onClick={() => void reExtractDocument(document)}
                >
                  <RefreshCcw size={14} />
                  {isReExtracting ? "Analysiert..." : "Neu analysieren"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 border-slate-700 bg-slate-950/70 px-3 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!hasFileContent(document)}
                  onClick={() => setPreviewDocument(document)}
                >
                  <Eye size={14} />
                  Vorschau
                </Button>
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
              </div>
            </div>
            );
          })}
        </div>
      </Panel>
      {previewDocument && <DocumentPreviewModal document={previewDocument} onClose={() => setPreviewDocument(null)} />}
    </>
  );

  async function reExtractDocument(document: SavedCaseDocument) {
    setMessage("");
    setReExtractingDocumentId(document.id);
    const result = await reExtractSavedDocument(record, document.id, user);
    if (result.record) {
      const nextRecord = markOutdatedGeneratedLetters(result.record, "Dokument wurde erneut extrahiert");
      const savedRecord = nextRecord === result.record
        ? result.record
        : CaseService.save(nextRecord, {
            actor: user,
            skipAutoActivity: true,
            activity: CaseService.buildActivity("letter_generated", "Schreiben als veraltet markiert", { actor: user, description: "Dokument wurde erneut extrahiert." }),
          });
      onRecordChange?.(savedRecord);
    }
    setMessage(`${result.analyzed} Dokument(e) erneut analysiert. ${result.skippedLegacy} Legacy-Dokument(e) übersprungen. ${result.message}`);
    setReExtractingDocumentId("");
  }
}

function QualityBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "inline-flex rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-extrabold text-emerald-200" : "inline-flex rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-extrabold text-amber-100"}>
      {label}
    </span>
  );
}

function DocumentInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-200">{value}</span>
    </div>
  );
}

export function CaseExtractedDataPanel({ record }: { record: SavedCaseRecord }) {
  const data = record.extracted;
  const rows: Array<[string, string | number | undefined]> = [
    ["Mieter", data.tenantName],
    ["Adresse", data.tenantFullAddress],
    ["Telefon", data.phone],
    ["Empfänger", data.recipientName],
    ["Vermieter", data.landlord],
    ["Antragsgegner", data.opposingParty],
    ["Vertretung", data.representation],
    ["Geburtsdatum", data.birthDate],
    ["Mietbeginn", data.leaseStart],
    ["Mietende", data.leaseEnd],
    ["Kaution", moneyOrMissing(data.deposit, "Fehlt")],
    ["Ausstattung", data.equipment],
    ["Abschläge/Korrekturen", data.adjustments],
  ];

  return <DataGridPanel title="Erkannte Daten" icon={<FileText size={18} />} rows={rows} />;
}

export function CaseCalculationPanel({ record }: { record: SavedCaseRecord }) {
  const calculation = record.calculation;
  const hasCalculation = Boolean(calculation && [calculation.currentGrossRent, calculation.allowedGrossRent, calculation.monthlyExcess, calculation.settlementAmount].some((value) => Number(value) > 0));

  if (!hasCalculation) {
    return <EmptyPanel icon={<Calculator size={24} />} title="Berechnung noch nicht durchgeführt" text="Nach der Datenprüfung wird die Mietzinsberechnung hier als strukturierte Übersicht angezeigt." />;
  }

  const mainRows: Array<[string, string | number | undefined]> = [
    ["Aktuelle Bruttomiete", moneyOrMissing(calculation.currentGrossRent, "Fehlt")],
    ["Erlaubte Bruttomiete", moneyOrMissing(calculation.allowedGrossRent, "Fehlt")],
    ["Monatliche Überschreitung", moneyOrMissing(calculation.monthlyExcess, "Nicht berechnet")],
    ["Zeitraum", calculation.months > 0 ? `${calculation.months} Monate` : "Nicht berechnet"],
    ["Gesamte Überzahlung", moneyOrMissing(calculation.totalExcess, "Nicht berechnet")],
    ["Vergleichsreduktion", `${formatNumber(calculation.settlementReductionPercent)} %`],
    ["Abschlagszahlungen", moneyOrMissing(calculation.paidDeductions, "Fehlt")],
    ["Vergleichsbetrag", moneyOrMissing(calculation.settlementAmount, "Nicht berechnet")],
    ["Künftige akzeptierte Miete", moneyOrMissing(calculation.futureAcceptedRent, "Nicht berechnet")],
  ];
  const sourceRows: Array<[string, string | number | undefined]> = [
    ["Quelle aktuelle Miete", getCalculationBasisLabel(calculation, "currentRent")],
    ["Quelle erlaubte Miete", getCalculationBasisLabel(calculation, "allowedRent")],
    ["Quelle Nutzfläche", getCalculationBasisLabel(calculation, "area")],
    ["Quelle Zeitraum", getCalculationBasisLabel(calculation, "period")],
  ];
  const richtwert = getRichtwertBasis(calculation);
  const basisRows: Array<[string, string | number | undefined]> = [
    ["Nutzfläche laut Vertrag", numberWithUnit(calculation.contractArea, "m²")],
    ["Nutzfläche nachgemessen", numberWithUnit(calculation.measuredArea, "m²")],
    ["Verwendete Nutzfläche", numberWithUnit(calculation.nutzflaeche, "m²")],
    ["Richtwertzins/m²", moneyOrMissing(richtwert?.guidelineRentPerSqm, "Fehlt")],
    ["Befristet", calculation.fixedTerm ? "Ja" : "Nein"],
    ["Verwendete erlaubte Bruttomiete", moneyOrMissing(calculation.allowedGrossRent, "Fehlt")],
    ["Berechnungsart", describeAllowedRentSource(richtwert?.selectedAllowedGrossRentSource ?? calculation.allowedRentSource)],
  ];
  const compositionRows: Array<[string, string | number | undefined]> = [
    ["Hauptmietzins", moneyOrMissing(calculation.hauptmietzins, "Fehlt")],
    ["Betriebskosten", moneyOrMissing(calculation.betriebskosten, "Fehlt")],
    ["Umsatzsteuer", moneyOrMissing(calculation.umsatzsteuer, "Fehlt")],
    ["Zuschläge", moneyOrMissing(calculation.sonstige_zuschlaege, "Fehlt")],
    ["Pauschalmiete", calculation.pauschalmiete ? "Ja" : "Nein"],
    ["Gesamtmiete brutto", moneyOrMissing(calculation.gesamtmiete_brutto, "Fehlt")],
  ];
  const refundRows: Array<[string, string | number | undefined]> = [
    ["Zeitraum", calculation.months > 0 ? `${calculation.months} Monate` : "Nicht berechnet"],
    ["Monatliche Überzahlung", moneyOrMissing(calculation.monatliche_ueberzahlung, "Nicht berechnet")],
    ["Gesamtüberzahlung", moneyOrMissing(calculation.gesamte_ueberzahlung, "Nicht berechnet")],
    ["Bereits rückerstattet", moneyOrMissing(calculation.bereits_rueckerstattet, "Fehlt")],
    ["Offene Forderung", moneyOrMissing(calculation.offene_forderung, "Nicht berechnet")],
  ];
  const settlementRows: Array<[string, string | number | undefined]> = [
    ["Vergleichsquote", `${formatNumber(calculation.vergleichsquote)} %`],
    ["Vergleichsbetrag", moneyOrMissing(calculation.vergleichsbetrag, "Nicht berechnet")],
    ["Künftige akzeptierte Miete", moneyOrMissing(calculation.zukuenftiger_mietzins, "Nicht berechnet")],
    ["Zukünftige Ersparnis", moneyOrMissing(calculation.zukuenftige_monatliche_ersparnis, "Nicht berechnet")],
  ];
  const warnings = calculation.calculationWarnings ?? [];
  const report = record.calculationReport ?? buildCalculationReport(calculation, calculation, record.extracted, { generatedAt: record.updatedAt });

  return (
    <Panel title="Berechnung" icon={<Calculator size={18} />}>
      <div className="space-y-5">
        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 text-amber-100">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <AlertTriangle size={16} />
              Berechnung prüfen
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold">
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        )}
        <CalculationGrid rows={mainRows} />
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-extrabold text-white">Mietzusammensetzung</h3>
            <Link href={`/cases/${record.id}/edit`} className="rounded-md border border-slate-700 px-3 py-2 text-xs font-extrabold text-slate-200 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200">
              Berechnung bearbeiten
            </Link>
          </div>
          <CalculationGrid rows={compositionRows} />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-extrabold text-white">Rückforderung</h3>
          <CalculationGrid rows={refundRows} />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-extrabold text-white">Vergleich & Zukunft</h3>
          <CalculationGrid rows={settlementRows} />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-extrabold text-white">Quellen</h3>
          <CalculationGrid rows={sourceRows} />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-extrabold text-white">Berechnungsbasis</h3>
          <CalculationGrid rows={basisRows} />
        </div>
        <CalculationReportPanel report={report} onPrint={() => printCalculationReport(report)} />
      </div>
    </Panel>
  );
}

export function CaseLetterPanel({ record, onRecordChange }: { record: SavedCaseRecord; onRecordChange: (record: SavedCaseRecord) => void }) {
  const { user } = useAuth();
  const [previewLetter, setPreviewLetter] = useState<GeneratedLetterVersion | null>(null);
  const [compareLetter, setCompareLetter] = useState<GeneratedLetterVersion | null>(null);
  const [draftNotice, setDraftNotice] = useState("");
  const letters = record.generatedLetters ?? [];
  const currentReview = record.letterReview;
  const communicationThreads = listThreads(record);

  function saveLetterStatusChange(letter: GeneratedLetterVersion, nextLetter: GeneratedLetterVersion, activityTitle: string, description?: string) {
    const nextRecord = CaseService.save(
      {
        ...record,
        generatedLetters: letters.map((item) => item.id === letter.id ? nextLetter : item),
        updatedAt: new Date().toISOString(),
      },
      { actor: user, skipAutoActivity: true, activity: CaseService.buildActivity("letter_generated", activityTitle, { actor: user, description, metadata: { version: letter.version, status: nextLetter.status } }) },
    );
    onRecordChange(nextRecord);
  }

  function markForReview(letter: GeneratedLetterVersion) {
    saveLetterStatusChange(
      letter,
      updateLetterVersionStatus(letter, "review", { changedBy: user?.id, changedByName: user?.name, note: "Zur Prüfung markiert" }),
      "Schreiben zur Prüfung markiert",
    );
  }

  function approveLetter(letter: GeneratedLetterVersion) {
    const approvalNote = window.prompt("Freigabenotiz optional:") ?? undefined;
    try {
      saveLetterStatusChange(
        letter,
        approveLetterVersion(letter, { approvedBy: user?.id, approvedByName: user?.name, approvalNote }),
        "Schreiben freigegeben",
        approvalNote,
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Schreiben konnte nicht freigegeben werden.");
    }
  }

  function markSent(letter: GeneratedLetterVersion) {
    const methodInput = (window.prompt("Versandmethode: email, post, manual oder other", "manual") || "manual").toLowerCase();
    const method = methodInput === "email" || methodInput === "post" || methodInput === "other" ? methodInput : "manual";
    const force = Boolean(letter.approval?.approvedAt) || window.confirm("Dieses Schreiben ist noch nicht freigegeben. Trotzdem als versendet markieren?");
    if (!force) return;
    const note = window.prompt("Versandnotiz optional:") ?? undefined;
    try {
      saveLetterStatusChange(
        letter,
        markLetterVersionSent(letter, { sentBy: user?.id, sentByName: user?.name, method, note, force }),
        "Schreiben als versendet markiert",
        note,
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Schreiben konnte nicht als versendet markiert werden.");
    }
  }

  function archiveLetter(letter: GeneratedLetterVersion) {
    saveLetterStatusChange(
      letter,
      archiveLetterVersion(letter, { changedBy: user?.id, changedByName: user?.name }),
      "Schreiben archiviert",
    );
  }

  function createEmailDraft(letter: GeneratedLetterVersion) {
    if (!canEditCase(user, record)) return;
    const nextRecord = createLetterEmailDraft(record, letter, { actor: user });
    const savedRecord = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    onRecordChange(savedRecord);
    setDraftNotice(`E-Mail-Entwurf fuer Version ${letter.version} wurde erstellt.`);
  }

  if (!record.letterText?.trim() && letters.length === 0) {
    return (
      <EmptyPanel
        icon={<FileText size={24} />}
        title="Noch kein Vergleichsschreiben"
        text="Das Schreiben kann im bestehenden Bearbeitungs-Wizard erstellt und anschließend hier geprüft werden."
        action={<Link href={`/cases/${record.id}/edit`} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500">Vergleichsschreiben erstellen</Link>}
      />
    );
  }

  return (
    <div className="grid gap-5">
      {record.letterText?.trim() && (
        <div className="grid gap-3">
          {currentReview && <CaseLetterReviewPanel review={currentReview} attachments={record.letterAttachments ?? []} />}
          <div className="overflow-hidden rounded-lg border border-slate-800 bg-white">
            <LetterDocumentPreview content={record.letterText} />
          </div>
        </div>
      )}

      <Panel title="Schreiben-Historie" icon={<FileText size={18} />}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2 text-sm">
          <span className="font-semibold text-slate-400">{communicationThreads.length > 0 ? `${communicationThreads.length} Kommunikations-Thread(s) vorhanden` : "Noch keine Kommunikations-Threads vorhanden"}</span>
          {draftNotice && <span className="font-bold text-emerald-200">{draftNotice}</span>}
        </div>
        {letters.length === 0 ? (
          <div className="text-sm text-slate-400">Noch keine versionierten Schreiben vorhanden. Bestehende Legacy-Dateien bleiben im Export-Tab verfügbar.</div>
        ) : (
          <div className="grid gap-3">
            {letters.map((letter) => (
              <div key={letter.id} className="rounded-lg border border-slate-800 bg-slate-950/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-extrabold text-white">Version {letter.version}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">{formatStoredDate(letter.createdAt)} · {letter.templateFileName ?? letter.templateName ?? "Vorlage nicht gespeichert"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-md px-2.5 py-1 text-xs font-extrabold ${letter.outdated || letter.status === "outdated" ? "bg-amber-500/10 text-amber-200" : "bg-emerald-500/10 text-emerald-200"}`}>
                      {letter.outdated || letter.status === "outdated" ? "Veraltet" : reviewStatusLabel(letter.review?.status ?? letter.status)}
                    </span>
                    <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-extrabold text-slate-200">{letter.docx?.dataUrl ? "DOCX" : "DOCX fehlt"}</span>
                    <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-extrabold text-slate-200">{letter.pdf?.dataUrl ? "PDF" : "PDF fehlt"}</span>
                  </div>
                </div>
                {(letter.outdated || letter.status === "outdated") && (
                  <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">
                    Dieses Schreiben basiert auf älteren Berechnungs-/Falldaten.
                  </div>
                )}
                {letter.review?.unresolvedPlaceholders?.length ? (
                  <div className="mt-3 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">
                    Nicht ersetzte Platzhalter: {letter.review.unresolvedPlaceholders.join(", ")}
                  </div>
                ) : null}
                {letter.review?.warnings?.length ? (
                  <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">
                    {letter.review.warnings.slice(0, 3).join(" · ")}
                  </div>
                ) : null}
                {letter.attachments?.length ? (
                  <div className="mt-3 text-xs font-semibold text-slate-400">Anlagen: {letter.attachments.map((attachment) => attachment.label).join(", ")}</div>
                ) : null}
                {letter.approval?.approvedAt && (
                  <div className="mt-3 text-xs font-semibold text-emerald-200">Freigegeben von {letter.approval.approvedByName ?? "Unbekannt"} am {formatStoredDate(letter.approval.approvedAt)}</div>
                )}
                {letter.sent?.sentAt && (
                  <div className="mt-2 text-xs font-semibold text-blue-200">Versendet per {letter.sent.method ?? "manual"} am {formatStoredDate(letter.sent.sentAt)}</div>
                )}
                {letter.statusHistory?.length ? (
                  <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2 text-xs font-semibold text-slate-400">
                    Verlauf: {letter.statusHistory.slice(0, 3).map((entry) => `${reviewStatusLabel(entry.status)} ${formatStoredDate(entry.changedAt)}`).join(" · ")}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <ReportActionButton onClick={() => setPreviewLetter(letter)}>Vorschau öffnen</ReportActionButton>
                  <ReportActionButton onClick={() => setCompareLetter(letter)}>Vorherige Version vergleichen</ReportActionButton>
                  <ReportActionButton onClick={() => markForReview(letter)}>Zur Prüfung markieren</ReportActionButton>
                  <ReportActionButton onClick={() => approveLetter(letter)}>Freigeben</ReportActionButton>
                  <ReportActionButton onClick={() => createEmailDraft(letter)}>E-Mail-Entwurf erstellen</ReportActionButton>
                  <ReportActionButton onClick={() => markSent(letter)}>Als versendet markieren</ReportActionButton>
                  <DownloadButton file={letter.docx} label="DOCX herunterladen" />
                  <DownloadButton file={letter.pdf} label="PDF herunterladen" />
                  {letter.status !== "archived" && <ReportActionButton onClick={() => archiveLetter(letter)}>Archivieren</ReportActionButton>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {previewLetter && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg border border-slate-800 bg-white">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div className="font-extrabold text-navy-950">Version {previewLetter.version}</div>
              <button type="button" onClick={() => setPreviewLetter(null)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-bold text-navy-950">Schließen</button>
            </div>
            <LetterDocumentPreview content={previewLetter.letterText || record.letterText || ""} />
          </div>
        </div>
      )}
      {compareLetter && (
        <VersionCompareModal current={compareLetter} previous={letters.find((letter) => letter.version === compareLetter.version - 1)} onClose={() => setCompareLetter(null)} />
      )}
    </div>
  );
}

export function CaseExportPanel({ record, onRecordChange }: { record: SavedCaseRecord; onRecordChange: (record: SavedCaseRecord) => void }) {
  const { user } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingReportDocx, setIsGeneratingReportDocx] = useState(false);
  const [isGeneratingReportPdf, setIsGeneratingReportPdf] = useState(false);
  const [message, setMessage] = useState("");
  const hasWord = hasFileContent(record.generatedWord);
  const hasPdf = hasFileContent(record.generatedPdf);
  const lastGeneratedAt = record.generatedPdf?.generatedAt ?? record.generatedWord?.generatedAt;
  const report = record.calculationReport ?? buildCalculationReport(record.calculation, record.calculation, record.extracted, { generatedAt: record.updatedAt });
  const reportGeneratedAt = record.calculationReportGeneratedAt ?? report.generatedAt;
  const reportLastExportedAt = record.calculationReportLastExportedAt;
  const reportExportedAt = record.calculationReportPdfGeneratedAt ?? record.calculationReportDocxGeneratedAt ?? reportLastExportedAt;
  const reportOutdated = Boolean(reportExportedAt && new Date(reportGeneratedAt).getTime() > new Date(reportExportedAt).getTime());
  const letterAttachments = buildLetterAttachments(record);
  const latestLetter = record.generatedLetters?.[0];

  async function generateExport() {
    const template = loadActiveStoredWordTemplate();
    if (!template?.dataUrl) {
      setMessage("Keine aktive Word-Vorlage vorhanden. Bitte laden Sie unter Vorlagen eine Vorlage hoch und setzen Sie sie als aktiv.");
      return;
    }

    setIsGenerating(true);
    setMessage("");

    try {
      const templateValues = createTemplateValues(record);
      const response = await fetch("/api/letters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateDataUrl: template.dataUrl,
          values: toDocxTemplateData(templateValues),
          fileBaseName: `Vergleichsschreiben_${sanitizeFileName(record.tenant)}`,
        }),
      });
      const result = (await response.json()) as GenerateLetterResponse;

      if (!response.ok) throw new Error(result.error || "Export konnte nicht erstellt werden.");

      const now = new Date().toISOString();
      const nextVersion = getNextLetterVersion(record.generatedLetters);
      const generatedWord = await buildStorageReadyGeneratedFile({
        caseId: record.id,
        kind: "letter",
        fileName: result.docx.fileName,
        mimeType: result.docx.mimeType,
        blob: generatedFileToBlob(result.docx),
        generatedAt: now,
        generatedBy: user?.name,
        ownerId: user?.id,
        letterVersion: nextVersion,
      });
      const generatedPdf = result.pdf
        ? await buildStorageReadyGeneratedFile({
            caseId: record.id,
            kind: "letter",
            fileName: result.pdf.fileName,
            mimeType: result.pdf.mimeType,
            blob: generatedFileToBlob(result.pdf),
            generatedAt: now,
            generatedBy: user?.name,
            ownerId: user?.id,
            letterVersion: nextVersion,
          })
        : record.generatedPdf;
      const baseRecordWithoutAttachments: SavedCaseRecord = {
        ...record,
        status: result.pdf ? "Schreiben erstellt" : record.status,
        updatedAt: now,
        lastActivity: new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(new Date()),
        generatedWord,
        generatedPdf,
      };
      const attachments = buildLetterAttachments(baseRecordWithoutAttachments);
      const review = buildLetterReview({ ...baseRecordWithoutAttachments, letterAttachments: attachments }, templateValues, record.letterText);
      const baseRecord: SavedCaseRecord = {
        ...baseRecordWithoutAttachments,
        letterAttachments: attachments,
        letterReview: review,
      };
      const nextRecord = appendGeneratedLetterVersion(
        baseRecord,
        createGeneratedLetterVersion({
          record: baseRecord,
          createdAt: now,
          createdBy: user?.name,
          template,
          letterText: record.letterText,
          docx: generatedWord,
          pdf: result.pdf ? generatedPdf : undefined,
          attachments,
          review,
          placeholdersUsed: Object.keys(templateValues),
          warnings: record.calculation.calculationWarnings,
          calculationReportAttached: Boolean(record.calculationReportDocx || record.calculationReportPdf),
        }),
      );

      const savedRecord = CaseService.save(nextRecord, {
        actor: user,
        skipAutoActivity: true,
        activity: [
          CaseService.buildActivity("letter_generated", `Schreiben Version ${nextVersion} erstellt`, { actor: user, metadata: { version: nextVersion, fileName: result.docx.fileName, reviewStatus: review.status } }),
          ...((review.warnings?.length ?? 0) > 0 ? [CaseService.buildActivity("letter_generated", "Schreiben mit Warnungen generiert", { actor: user, description: review.warnings?.join("; ") })] : []),
          ...((review.unresolvedPlaceholders?.length ?? 0) > 0 ? [CaseService.buildActivity("letter_generated", "Nicht ersetzte Platzhalter erkannt", { actor: user, description: review.unresolvedPlaceholders?.join(", ") })] : []),
          CaseService.buildActivity(result.pdf ? "export_generated" : "note", result.pdf ? "PDF exportiert" : "PDF-Export fehlgeschlagen", {
            actor: user,
            description: result.pdf ? undefined : result.pdfError || "PDF konnte nicht erstellt werden.",
            metadata: { fileName: result.pdf?.fileName, pdfError: result.pdfError },
          }),
        ],
      });
      onRecordChange(savedRecord);
      setMessage(result.pdf ? "Word und PDF wurden neu generiert." : result.pdfError || "Word wurde erstellt, PDF konnte nicht erstellt werden.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Fehler bei PDF-Erstellung.";
      setMessage(errorMessage);
      CaseService.addActivity(record.id, CaseService.buildActivity("note", "Export fehlgeschlagen", { actor: user, description: errorMessage }));
    } finally {
      setIsGenerating(false);
    }
  }

  function showReport() {
    setMessage(renderCalculationReportAsText(report));
  }

  function printReport() {
    printCalculationReport(report);
    markReportExported("Berechnungsbericht zum Drucken vorbereitet.");
  }

  async function prepareReportExport(kind: "docx" | "pdf") {
    if (kind === "docx") setIsGeneratingReportDocx(true);
    if (kind === "pdf") setIsGeneratingReportPdf(true);
    setMessage("");

    try {
      const now = new Date().toISOString();
      if (kind === "docx") {
        const docx = await generateCalculationReportDocx({ ...record, calculationReport: report });
        const savedRecord = await saveReportExport({
          now,
          docx,
          message: "Berechnungsbericht DOCX generiert.",
          activityTitle: "Berechnungsbericht DOCX generiert",
        });
        void downloadFile(savedRecord.calculationReportDocx);
        return;
      }

      const result = await generateCalculationReportPdf({ ...record, calculationReport: report });
      const savedRecord = await saveReportExport({
        now,
        docx: result.docx,
        pdf: result.pdf ?? undefined,
        pdfError: result.pdfError,
        message: result.pdf ? "Berechnungsbericht PDF generiert." : result.pdfError || "DOCX wurde erstellt, PDF konnte nicht erstellt werden.",
        activityTitle: result.pdf ? "Berechnungsbericht PDF generiert" : "Berechnungsbericht Export fehlgeschlagen",
      });
      void downloadFile(savedRecord.calculationReportPdf);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Berechnungsbericht Export fehlgeschlagen.";
      setMessage(errorMessage);
      CaseService.addActivity(record.id, CaseService.buildActivity("note", "Berechnungsbericht Export fehlgeschlagen", { actor: user, description: errorMessage }));
    } finally {
      setIsGeneratingReportDocx(false);
      setIsGeneratingReportPdf(false);
    }
  }

  function markReportExported(nextMessage: string) {
    void saveReportExport({ now: new Date().toISOString(), message: nextMessage, activityTitle: "Berechnungsbericht vorbereitet" });
  }

  async function saveReportExport({
    now,
    docx,
    pdf,
    pdfError,
    message: nextMessage,
    activityTitle,
  }: {
    now: string;
    docx?: { fileName: string; mimeType: string; base64: string };
    pdf?: { fileName: string; mimeType: string; base64: string };
    pdfError?: string;
    message: string;
    activityTitle: string;
  }) {
    const generatedDocx = docx
      ? await buildStorageReadyGeneratedFile({
          caseId: record.id,
          kind: "calculation-report",
          fileName: docx.fileName,
          mimeType: docx.mimeType,
          blob: generatedFileToBlob(docx),
          generatedAt: now,
          generatedBy: user?.name,
          ownerId: user?.id,
        })
      : record.calculationReportDocx;
    const generatedPdf = pdf
      ? await buildStorageReadyGeneratedFile({
          caseId: record.id,
          kind: "calculation-report",
          fileName: pdf.fileName,
          mimeType: pdf.mimeType,
          blob: generatedFileToBlob(pdf),
          generatedAt: now,
          generatedBy: user?.name,
          ownerId: user?.id,
        })
      : record.calculationReportPdf;

    const nextRecordBase: SavedCaseRecord = {
      ...record,
      calculationReport: report,
      calculationReportGeneratedAt: reportGeneratedAt,
      calculationReportVersion: record.calculationReportVersion ?? "4.8",
      calculationReportLastExportedAt: now,
      calculationReportDocx: generatedDocx,
      calculationReportPdf: generatedPdf,
      calculationReportDocxGeneratedAt: docx ? now : record.calculationReportDocxGeneratedAt,
      calculationReportPdfGeneratedAt: pdf ? now : record.calculationReportPdfGeneratedAt,
      updatedAt: now,
      lastActivity: new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(new Date()),
    };
    const savedRecord = CaseService.save(
      {
        ...nextRecordBase,
        letterAttachments: buildLetterAttachments(nextRecordBase),
      },
      { actor: user, skipAutoActivity: true, activity: CaseService.buildActivity(pdfError ? "note" : "export_generated", activityTitle, { actor: user, description: pdfError }) },
    );
    onRecordChange(savedRecord);
    setMessage(nextMessage);
    return savedRecord;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Panel title="Export" icon={<Download size={18} />}>
        <p className="text-sm leading-6 text-slate-400">Word und PDF werden aus der aktiven Word-Vorlage und den gespeicherten Falldaten erzeugt.</p>
        {message && <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">{message}</div>}
        {(record.letterReview?.unresolvedPlaceholders?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">
            Das Schreiben enthält nicht ersetzte Platzhalter: {record.letterReview?.unresolvedPlaceholders?.join(", ")}
          </div>
        )}
        {latestLetter && !latestLetter.approval?.approvedAt && (
          <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">
            Dieses Schreiben ist noch nicht freigegeben.
          </div>
        )}
        {latestLetter?.outdated && (
          <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">
            Diese Version basiert auf älteren Falldaten.
          </div>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => void generateExport()}
            disabled={isGenerating}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isGenerating ? "Wird generiert..." : "Word & PDF generieren"}
          </button>
          <DownloadButton file={record.generatedWord} label="Word herunterladen" />
          <DownloadButton file={record.generatedPdf} label="PDF herunterladen" />
        </div>
        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/35 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-extrabold text-white">Anlagen</div>
              <div className="mt-1 text-sm text-slate-400">Diese Anlagen werden für das Schreiben referenziert und für spätere ZIP-/Versandfunktionen vorgemerkt.</div>
            </div>
            <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-extrabold text-slate-200">{letterAttachments.length} erkannt</span>
          </div>
          <div className="mt-4 grid gap-2">
            {letterAttachments.length > 0 ? letterAttachments.map((attachment) => (
              <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2 text-sm">
                <div>
                  <div className="font-bold text-slate-100">{attachment.label}</div>
                  <div className="text-xs font-semibold text-slate-500">{attachment.fileName ?? "Dateiname nicht gespeichert"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={attachment.includedInLetter === false ? "rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-400" : "rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-extrabold text-emerald-200"}>{attachment.includedInLetter === false ? "Nicht beigefügt" : "Im Schreiben"}</span>
                  {attachment.type === "berechnungsbericht" && <span className="rounded-md bg-blue-500/10 px-2 py-1 text-xs font-extrabold text-blue-200">{record.calculationReportDocx || record.calculationReportPdf ? "Export vorhanden" : "Bericht vorhanden"}</span>}
                </div>
              </div>
            )) : (
              <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">Keine Anlagen erkannt.</div>
            )}
          </div>
        </div>
        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/35 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-extrabold text-white">Berechnungsbericht</div>
              <div className="mt-1 text-sm text-slate-400">Strukturierter interner Bericht für Druck, DOCX oder PDF-Vorbereitung.</div>
            </div>
            {reportOutdated && <span className="rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-extrabold text-amber-200">Veraltet</span>}
          </div>
          {reportOutdated && <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">Berechnungsbericht wurde vor den letzten Änderungen erstellt.</div>}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ReportActionButton onClick={showReport}>Bericht anzeigen</ReportActionButton>
            <ReportActionButton onClick={printReport}>Bericht drucken</ReportActionButton>
            <ReportActionButton onClick={() => void prepareReportExport("docx")}>{isGeneratingReportDocx ? "DOCX wird erstellt..." : "Bericht als DOCX vorbereiten"}</ReportActionButton>
            <ReportActionButton onClick={() => void prepareReportExport("pdf")}>{isGeneratingReportPdf ? "PDF wird erstellt..." : "Bericht als PDF vorbereiten"}</ReportActionButton>
            <DownloadButton file={record.calculationReportDocx} label="Bericht DOCX herunterladen" />
            <DownloadButton file={record.calculationReportPdf} label="Bericht PDF herunterladen" />
          </div>
        </div>
      </Panel>
      <Panel title="Exportstatus" icon={<FileText size={18} />}>
        <div className="grid gap-3 text-sm">
          <StatusLine label="Word" value={hasWord ? "Word erstellt" : "Nicht generiert"} />
          <StatusLine label="PDF" value={hasPdf ? "PDF erstellt" : message.includes("PDF") ? "Fehler" : "Nicht generiert"} />
          <StatusLine label="Zuletzt generiert" value={lastGeneratedAt ? formatStoredDate(lastGeneratedAt) : "-"} />
          <StatusLine label="Bericht" value={reportGeneratedAt ? "Bericht generiert" : "Nicht generiert"} />
          <StatusLine label="Bericht DOCX" value={record.calculationReportDocxGeneratedAt ? "DOCX erstellt" : "Nicht generiert"} />
          <StatusLine label="Bericht PDF" value={record.calculationReportPdfGeneratedAt ? "PDF erstellt" : "Nicht generiert"} />
          <StatusLine label="Bericht exportiert" value={reportExportedAt ? formatStoredDate(reportExportedAt) : "-"} />
        </div>
      </Panel>
    </div>
  );
}

function CaseLetterReviewPanel({ review, attachments }: { review: LetterReview; attachments: LetterAttachment[] }) {
  return (
    <Panel title="Review-Status" icon={<CheckCircle2 size={18} />}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`rounded-md px-2.5 py-1 text-xs font-extrabold ${reviewToneClass(review.status)}`}>{reviewStatusLabel(review.status)}</span>
        <span className="text-xs font-semibold text-slate-500">{attachments.length} Anlage(n)</span>
      </div>
      <ReviewRows title="Warnungen" values={review.warnings} />
      <ReviewRows title="Fehlende Felder" values={review.missingFields} />
      <ReviewRows title="Nicht ersetzte Platzhalter" values={review.unresolvedPlaceholders} />
      {attachments.length > 0 && <div className="mt-3 text-sm font-semibold text-slate-400">Anlagen: {attachments.map((attachment) => attachment.label).join(", ")}</div>}
    </Panel>
  );
}

function VersionCompareModal({ current, previous, onClose }: { current: GeneratedLetterVersion; previous?: GeneratedLetterVersion; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="font-extrabold text-white">Versionsvergleich</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Einfache Gegenüberstellung ohne Text-Diff</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-bold text-slate-100">Schließen</button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <VersionCompareColumn title="Vorherige Version" letter={previous} />
          <VersionCompareColumn title="Ausgewählte Version" letter={current} />
        </div>
      </div>
    </div>
  );
}

function VersionCompareColumn({ title, letter }: { title: string; letter?: GeneratedLetterVersion }) {
  if (!letter) {
    return <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-semibold text-slate-400">{title}: keine vorherige Version vorhanden.</div>;
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="font-extrabold text-white">{title} · Version {letter.version}</div>
      <div className="mt-2 grid gap-2 text-sm text-slate-300">
        <StatusLine label="Datum" value={formatStoredDate(letter.createdAt)} />
        <StatusLine label="Status" value={reviewStatusLabel(letter.review?.status ?? letter.status)} />
        <StatusLine label="Vorlage" value={letter.templateFileName ?? letter.templateName ?? "-"} />
        <StatusLine label="Warnungen" value={letter.review?.warnings?.join("; ") || "-"} />
        <StatusLine label="Platzhalter" value={letter.review?.unresolvedPlaceholders?.join(", ") || "-"} />
      </div>
      <div className="mt-4 max-h-[420px] overflow-auto rounded-md bg-white">
        <LetterDocumentPreview content={letter.letterText ?? ""} />
      </div>
    </div>
  );
}

function ReviewRows({ title, values }: { title: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 grid gap-1 text-sm font-semibold text-amber-100">
        {values.map((value) => <div key={value}>{value}</div>)}
      </div>
    </div>
  );
}

function reviewStatusLabel(status?: string) {
  if (status === "approved") return "Approved";
  if (status === "ready") return "Ready";
  if (status === "warning") return "Warning";
  if (status === "review_required") return "Review erforderlich";
  if (status === "review") return "Prüfung erforderlich";
  if (status === "sent") return "Versendet";
  if (status === "generated") return "Generiert";
  if (status === "outdated") return "Veraltet";
  if (status === "archived") return "Archiviert";
  return "Draft";
}

function reviewToneClass(status?: string) {
  if (status === "ready" || status === "approved") return "bg-emerald-500/10 text-emerald-200";
  if (status === "review_required") return "bg-red-500/10 text-red-200";
  return "bg-amber-500/10 text-amber-100";
}

export function CaseActivityPanel({ record }: { record: SavedCaseRecord }) {
  const activities = CaseService.ensureActivityLog(record).activityLog ?? [];

  return (
    <Panel title="Aktivität" icon={<FileText size={18} />}>
      {activities.length > 0 ? (
        <div className="relative grid gap-3">
          {activities
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((activity) => (
              <div key={activity.id} className="relative flex gap-3 rounded-lg border border-slate-800 bg-slate-950/35 p-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${activityIconClass(activity.type)}`}>
                  {activityIcon(activity.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-extrabold text-white">{activity.title}</div>
                    <div className="text-xs font-semibold text-slate-500">{formatStoredDate(activity.createdAt)}</div>
                  </div>
                  {activity.description && <div className="mt-1 text-sm leading-5 text-slate-400">{activity.description}</div>}
                  <div className="mt-2 text-xs font-bold text-slate-500">{activity.userName ?? "System"}</div>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/35 p-6 text-center text-sm font-semibold text-slate-500">Noch keine Aktivitäten vorhanden</div>
      )}
    </Panel>
  );
}

export function CaseDangerZone({ canEdit, onDelete }: { canEdit: boolean; onDelete: () => void }) {
  return (
    <section className="rounded-lg border border-red-500/30 bg-red-950/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-extrabold text-red-100">
            <AlertTriangle size={18} />
            Gefahrenbereich
          </div>
          <p className="mt-1 text-sm leading-6 text-red-100/70">Das Löschen entfernt diesen Fall aus der gespeicherten Fallliste.</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canEdit}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-400/40 px-4 text-sm font-bold text-red-100 transition hover:bg-red-500/10 disabled:border-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent"
        >
          <Trash2 size={16} />
          Fall löschen
        </button>
      </div>
    </section>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20">{icon}</div>
        <h2 className="font-extrabold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DataGridPanel({ title, icon, rows }: { title: string; icon: ReactNode; rows: Array<[string, string | number | undefined]> }) {
  return (
    <Panel title={title} icon={icon}>
      <CalculationGrid rows={rows} />
    </Panel>
  );
}

function CalculationGrid({ rows }: { rows: Array<[string, string | number | undefined]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <InfoTile key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function CalculationReportPanel({ report, onPrint }: { report: CalculationReport; onPrint: () => void }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-white">Berechnungsbericht</h3>
          <div className="mt-1 text-xs font-semibold text-slate-500">Erstellt {formatOptionalDocumentDate(report.generatedAt)}</div>
        </div>
        <button type="button" onClick={onPrint} className="rounded-md border border-slate-700 px-3 py-2 text-xs font-extrabold text-slate-200 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200">
          Bericht drucken
        </button>
        {report.warnings && report.warnings.length > 0 && <span className="rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-extrabold text-amber-200">{report.warnings.length} Warnung(en)</span>}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {report.sections.map((section) => (
          <div key={section.title} className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{section.title}</div>
            <div className="mt-3 space-y-2">
              {section.entries.map((entry) => (
                <div key={`${section.title}-${entry.label}`} className="rounded-md border border-slate-800 bg-slate-900/80 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-white">{entry.label}</div>
                      {entry.source && <div className="mt-0.5 text-xs font-semibold text-slate-500">{entry.overridden ? "Manuell angepasst" : entry.source}</div>}
                    </div>
                    <div className={entry.warning ? "text-right text-sm font-extrabold text-amber-200" : "text-right text-sm font-extrabold text-white"}>{entry.formattedValue ?? String(entry.value ?? "Fehlt")}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function printCalculationReport(report: CalculationReport) {
  const printWindow = window.open("", "_blank", "width=960,height=720");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(renderCalculationReportAsHtml(report));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function InfoTile({ label, value }: { label: string; value?: string | number }) {
  const displayValue = value === undefined || value === null || value === "" ? "Fehlt" : value;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={displayValue === "Fehlt" ? "mt-2 text-sm font-bold text-slate-500" : "mt-2 break-words text-sm font-bold text-white"}>{displayValue}</div>
    </div>
  );
}

function EmptyPanel({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-slate-700 bg-slate-900/55 px-5 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-lg bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20">{icon}</div>
      <h2 className="mt-4 text-lg font-extrabold text-white">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-2">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}

function activityIcon(type: CaseActivityType) {
  if (type === "created") return <FileText size={16} />;
  if (type === "updated") return <Pencil size={16} />;
  if (type === "document_uploaded" || type === "document_replaced" || type === "document_removed") return <FolderOpen size={16} />;
  if (type === "extraction_started" || type === "extraction_completed") return <FileCheck2 size={16} />;
  if (type === "calculation_updated") return <Calculator size={16} />;
  if (type === "letter_generated") return <FileText size={16} />;
  if (type === "export_generated") return <Download size={16} />;
  if (type === "shared") return <Share2 size={16} />;
  if (type === "assigned") return <Users size={16} />;
  if (type === "completed") return <CheckCircle2 size={16} />;
  if (type === "deleted") return <Trash2 size={16} />;
  return <CircleDot size={16} />;
}

function activityIconClass(type: CaseActivityType) {
  if (type === "completed" || type === "export_generated") return "bg-emerald-500/15 text-emerald-300";
  if (type === "document_removed" || type === "deleted") return "bg-red-500/15 text-red-300";
  if (type === "shared" || type === "assigned") return "bg-violet-500/15 text-violet-300";
  if (type === "extraction_started" || type === "extraction_completed") return "bg-blue-500/15 text-blue-300";
  if (type === "calculation_updated") return "bg-orange-500/15 text-orange-300";
  return "bg-slate-800 text-slate-300";
}

function HeaderActionLink({ href, disabled, children }: { href: string; disabled?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-disabled={disabled}
      className={
        disabled
          ? "pointer-events-none inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-800 px-3 text-sm font-bold text-slate-600"
          : "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-bold text-slate-200 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
      }
    >
      {children}
    </Link>
  );
}

function HeaderActionButton({ onClick, disabled, danger, children }: { onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  const enabledClass = danger
    ? "border-red-500/30 text-red-100 hover:bg-red-500/10"
    : "border-slate-700 text-slate-200 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-bold transition disabled:border-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent ${enabledClass}`}
    >
      {children}
    </button>
  );
}

function ReportActionButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-700 px-3 py-2 text-center text-sm font-bold text-slate-200 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200">
      {children}
    </button>
  );
}

function DownloadButton({ file, label }: { file?: SavedCaseRecord["generatedWord"]; label: string }) {
  return (
    <button
      disabled={!hasFileContent(file)}
      onClick={() => void downloadFile(file)}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-700 px-4 text-sm font-bold text-slate-200 transition hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent"
    >
      <Download size={16} />
      {label}
    </button>
  );
}

async function downloadFile(file?: SavedCaseRecord["generatedWord"]) {
  if (!file) return;
  const blob = await fileToBlob(file);
  if (blob) downloadBlob(blob, file.fileName);
}

function getWorkflowSteps(record: SavedCaseRecord) {
  const hasExtractedData = Boolean(record.extracted.tenantName || record.extracted.tenantFullAddress || record.extracted.grossRent > 0);
  const hasCalculation = Boolean(record.calculation && [record.calculation.currentGrossRent, record.calculation.allowedGrossRent, record.calculation.monthlyExcess, record.calculation.settlementAmount].some((value) => Number(value) > 0));
  const statusRank = ["Entwurf", "Dokumente hochgeladen", "Daten geprüft", "Berechnung abgeschlossen", "Schreiben erstellt", "Abgeschlossen"].indexOf(record.status);

  return [
    { label: "Dokumente hochgeladen", done: record.documents.length > 0 || statusRank >= 1 },
    { label: "Daten erkannt", done: hasExtractedData },
    { label: "Daten geprüft", done: statusRank >= 2 },
    { label: "Berechnung", done: hasCalculation || statusRank >= 3 },
    { label: "Schreiben erstellt", done: Boolean(record.letterText?.trim()) || statusRank >= 4 },
    { label: "Export erstellt", done: hasFileContent(record.generatedWord) || hasFileContent(record.generatedPdf) },
    { label: "Abgeschlossen", done: record.status === "Abgeschlossen" },
  ];
}

function moneyOrMissing(value: number | undefined, missing: string) {
  if (!value || Number(value) <= 0) return missing;
  return formatCurrency(value);
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function numberWithUnit(value: number | undefined, unit: string) {
  if (!value || Number(value) <= 0) return "Fehlt";
  return `${formatNumber(value)} ${unit}`;
}

function getCalculationBasisLabel(calculation: CalculationResult, key: "currentRent" | "allowedRent" | "area" | "period") {
  const basis = calculation.calculationBasis?.[key];
  if (!isBasisRecord(basis)) return "Fehlt";
  return `${basis.label} (${basis.source})`;
}

function getRichtwertBasis(calculation: CalculationResult) {
  const richtwert = calculation.calculationBasis?.richtwert;
  if (!richtwert || typeof richtwert !== "object") return undefined;
  return richtwert as { guidelineRentPerSqm?: number; selectedAllowedGrossRentSource?: string };
}

function describeAllowedRentSource(source: string | undefined) {
  if (!source) return "Fehlt";
  if (source === "richtwert.allowedGrossRent" || source === "richtwert.allowedGrossRentFixedTerm") return "Richtwert-PDF";
  if (source.startsWith("calculated.")) return "Intern hergeleitet";
  if (source.startsWith("manual.")) return "Manuell";
  return source;
}

function isBasisRecord(value: unknown): value is { label: string; source: string } {
  return Boolean(value && typeof value === "object" && "label" in value && "source" in value);
}

function statToneClass(tone: string) {
  if (tone === "blue") return "text-blue-300";
  if (tone === "green") return "text-emerald-300";
  if (tone === "orange") return "text-orange-300";
  if (tone === "red") return "text-red-300";
  if (tone === "violet") return "text-violet-300";
  return "text-white";
}

function generatedFileToBlob(file: GeneratedFile) {
  const binary = window.atob(file.base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: file.mimeType });
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase();
}

type GeneratedFile = {
  fileName: string;
  mimeType: string;
  base64: string;
};

type GenerateLetterResponse = {
  docx: GeneratedFile;
  pdf: GeneratedFile | null;
  pdfError?: string;
  error?: string;
};
