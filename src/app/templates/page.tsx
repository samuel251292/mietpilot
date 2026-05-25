"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, FileCheck2, FileText, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getLetterPlaceholderCatalog } from "@/lib/letters/letter-data";
import {
  createDocxFromTemplate,
  createStoredTemplateFromFile,
  downloadBlob,
  hasTemplateFileContent,
  loadWordTemplates,
  saveWordTemplates,
  templateToBlob,
  type StoredWordTemplate,
  type TemplateStatus,
} from "@/lib/word-templates";

type WordTemplate = StoredWordTemplate;

const placeholderCatalog = getLetterPlaceholderCatalog();
const recommendedPlaceholders = placeholderCatalog.map((entry) => entry.placeholder);
const structurePlaceholders = placeholderCatalog.filter((entry) => entry.group === "Schreiben-Struktur" || entry.group === "Anlagen");

const initialTemplates: WordTemplate[] = [];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<WordTemplate[]>(initialTemplates);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const activeTemplate = useMemo(() => templates.find((template) => template.status === "Aktiv") ?? templates[0], [templates]);
  const missingPlaceholders = activeTemplate ? recommendedPlaceholders.filter((placeholder) => !activeTemplate.placeholders.includes(placeholder)) : recommendedPlaceholders;
  const unknownPlaceholders = activeTemplate?.unknownPlaceholders ?? [];

  useEffect(() => {
    const storedTemplates = loadWordTemplates();
    if (storedTemplates.length > 0) {
      setTemplates(storedTemplates);
    }
  }, []);

  async function uploadTemplate(file: File) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setMessage({ tone: "error", text: "Bitte eine Word-Datei im DOCX-Format hochladen." });
      return;
    }

    setIsProcessing(true);
    setMessage({ tone: "info", text: "Word-Vorlage wird verarbeitet..." });

    try {
      const newTemplate = await createStoredTemplateFromFile({
        file,
    uploadedBy: "Alex Berger",
        recommendedPlaceholders,
      });

      setTemplates((current) => {
        const next = [newTemplate, ...current];
        saveWordTemplates(next);
        return next;
      });
      setMessage({ tone: "success", text: `${file.name} wurde als inaktive Vorlage hochgeladen.` });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Die Word-Vorlage konnte nicht gelesen werden.",
      });
    } finally {
      setIsProcessing(false);
    }
  }

  function setActive(id: string) {
    setTemplates((current) =>
      persistTemplates(
        current.map((template) => ({
          ...template,
          status: template.id === id ? "Aktiv" : "Inaktiv",
        })),
      ),
    );
    setMessage({ tone: "success", text: "Aktive Vorlage wurde aktualisiert." });
  }

  function deleteTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (template?.status === "Aktiv") {
      setMessage({ tone: "error", text: "Die aktive Vorlage kann nicht geloescht werden." });
      return;
    }

    setTemplates((current) => persistTemplates(current.filter((item) => item.id !== id)));
    setMessage({ tone: "success", text: "Vorlage wurde aus der Liste entfernt." });
  }

  function downloadTemplate(template: WordTemplate) {
    if (!hasTemplateFileContent(template)) {
      setMessage({
        tone: "info",
        text: "Diese Beispielvorlage ist noch nicht als echte Datei hinterlegt. Bitte eine DOCX-Vorlage hochladen.",
      });
      return;
    }

    void templateToBlob(template).then((blob) => {
      if (blob) downloadBlob(blob, template.fileName);
    });
    setMessage({ tone: "success", text: `${template.fileName} wurde heruntergeladen.` });
  }

  async function testDocument() {
    if (!activeTemplate || !hasTemplateFileContent(activeTemplate)) {
      setMessage({
        tone: "info",
        text: "Test-Dokument-Erstellung wird im naechsten Schritt fuer Beispielvorlagen implementiert. Laden Sie eine echte DOCX-Vorlage hoch, um sie zu testen.",
      });
      return;
    }

    setIsProcessing(true);
    setMessage({ tone: "info", text: "Test-Dokument wird erstellt..." });

    try {
      const blob = await createDocxFromTemplate(activeTemplate, createTestDocumentValues());
      downloadBlob(blob, "test-vergleichsschreiben.docx");
      setTemplates((current) =>
        persistTemplates(
          current.map((template) =>
              template.id === activeTemplate.id ? { ...template, lastTestStatus: "Test erfolgreich" } : template,
          ),
        ),
      );
      setMessage({ tone: "success", text: "Test-Dokument wurde erstellt und heruntergeladen." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Test-Dokument konnte nicht erstellt werden.",
      });
    } finally {
      setIsProcessing(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) uploadTemplate(file);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-950">Vorlagen</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Verwalten Sie hier die Word-Vorlage fuer automatisch generierte Vergleichsschreiben. Neue Schreiben verwenden immer die aktive Vorlage.
          </p>
        </div>
        {message && (
          <div
            className={cn(
              "rounded-md px-3 py-2 text-sm font-semibold",
              message.tone === "success" && "bg-emerald-50 text-emerald-700",
              message.tone === "error" && "bg-red-50 text-red-700",
              message.tone === "info" && "bg-blue-50 text-blue-700",
            )}
          >
            {message.text}
          </div>
        )}
      </header>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <ActiveTemplateCard template={activeTemplate} isProcessing={isProcessing} onDownload={() => activeTemplate && downloadTemplate(activeTemplate)} onTest={testDocument} />
        <UploadTemplateCard dragging={dragging} isProcessing={isProcessing} setDragging={setDragging} onDrop={handleDrop} onUpload={uploadTemplate} />
      </section>

      <PlaceholderCheckCard found={activeTemplate?.placeholders ?? []} missing={missingPlaceholders} unknown={unknownPlaceholders} structurePlaceholders={structurePlaceholders} />

      <Card>
        <CardHeader>
          <h2 className="text-lg font-extrabold text-navy-950">Weitere Vorlagen</h2>
          <p className="mt-1 text-sm text-slate-500">Alle hochgeladenen DOCX-Vorlagen. Es kann immer nur eine Vorlage aktiv sein.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {templates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                onSetActive={() => setActive(template.id)}
                onDownload={() => downloadTemplate(template)}
                onDelete={() => deleteTemplate(template.id)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ActiveTemplateCard({
  template,
  isProcessing,
  onDownload,
  onTest,
}: {
  template?: WordTemplate;
  isProcessing: boolean;
  onDownload: () => void;
  onTest: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-navy-950">Aktive Vergleichsschreiben-Vorlage</h2>
          <p className="mt-1 text-sm text-slate-500">Diese Word-Datei wird fuer neue Vergleichsschreiben verwendet.</p>
        </div>
        <StatusBadge status="Aktiv" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <InfoItem label="Dateiname" value={template?.fileName ?? "Keine aktive Vorlage"} icon={<FileText size={18} />} />
          <InfoItem label="Upload-Datum" value={template?.uploadedAt ?? "-"} />
          <InfoItem label="Hochgeladen von" value={template?.uploadedBy ?? "-"} />
          <InfoItem label="Gefundene Platzhalter" value={`${template?.placeholders.length ?? 0}`} />
          <InfoItem label="Letzter Teststatus" value={template?.lastTestStatus ?? "Keine Vorlage getestet"} icon={<CheckCircle2 size={18} />} />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onDownload} disabled={isProcessing || !hasTemplateFileContent(template)}>
            <Download size={16} />
            Vorlage herunterladen
          </Button>
          <Button onClick={onTest} disabled={isProcessing || !hasTemplateFileContent(template)}>
            <FileCheck2 size={16} />
            {isProcessing ? "Wird verarbeitet..." : "Test-Dokument erstellen"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UploadTemplateCard({
  dragging,
  isProcessing,
  setDragging,
  onDrop,
  onUpload,
}: {
  dragging: boolean;
  isProcessing: boolean;
  setDragging: (value: boolean) => void;
  onDrop: (event: DragEvent<HTMLLabelElement>) => void;
  onUpload: (file: File) => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-extrabold text-navy-950">Neue Word-Vorlage hochladen</h2>
        <p className="mt-1 text-sm text-slate-500">Die Formatierung aus Word bleibt erhalten.</p>
      </CardHeader>
      <CardContent>
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex min-h-[210px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition",
            dragging ? "border-blue-700 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40",
          )}
        >
          <div className="grid h-14 w-14 place-items-center rounded-lg bg-white text-blue-700 shadow-sm">
            <UploadCloud size={28} />
          </div>
          <div className="mt-4 text-base font-extrabold text-navy-950">DOCX-Datei hier ablegen</div>
          <div className="mt-1 text-sm text-slate-500">oder Datei auswaehlen</div>
        </label>
        <Button type="button" className="mt-5 w-full" disabled={isProcessing} onClick={() => fileInputRef.current?.click()}>
          {isProcessing ? "Vorlage wird verarbeitet..." : "Word-Vorlage hochladen"}
        </Button>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onUpload(file);
            event.currentTarget.value = "";
          }}
        />
        <p className="mt-3 text-xs font-semibold text-slate-500">Nur .docx erlaubt.</p>
      </CardContent>
    </Card>
  );
}

function PlaceholderCheckCard({
  found,
  missing,
  unknown,
  structurePlaceholders,
}: {
  found: string[];
  missing: string[];
  unknown: string[];
  structurePlaceholders: typeof placeholderCatalog;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-extrabold text-navy-950">Platzhalter-Pruefung</h2>
        <p className="mt-1 text-sm text-slate-500">Pruefung der aktiven Vorlage gegen die empfohlenen Platzhalter.</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 xl:grid-cols-3">
          <div>
            <h3 className="mb-3 text-sm font-extrabold text-navy-950">Gefundene Platzhalter</h3>
            <div className="flex flex-wrap gap-2">
              {found.length > 0 ? (
                found.map((placeholder) => (
                  <span key={placeholder} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
                    <CheckCircle2 size={14} />
                    {placeholder}
                  </span>
                ))
              ) : (
                <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600">Keine Platzhalter gefunden</span>
              )}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-extrabold text-navy-950">Fehlende empfohlene Platzhalter</h3>
            <div className="flex flex-wrap gap-2">
              {missing.length > 0 ? (
                missing.map((placeholder) => (
                  <span key={placeholder} className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700">
                    <AlertTriangle size={14} />
                    {placeholder}
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
                  <CheckCircle2 size={14} />
                  Alle empfohlenen Platzhalter vorhanden
                </span>
              )}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-extrabold text-navy-950">Unbekannte Platzhalter</h3>
            <div className="flex flex-wrap gap-2">
              {unknown.length > 0 ? (
                unknown.map((placeholder) => (
                  <span key={placeholder} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700">
                    <AlertTriangle size={14} />
                    {placeholder}
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
                  <CheckCircle2 size={14} />
                  Keine unbekannten Platzhalter
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h3 className="text-sm font-extrabold text-navy-950">Neue Baustein-Platzhalter</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Diese optionalen Platzhalter liefern fertig formulierte Abschnitte fuer professionelle Schreiben und Anlagenhinweise. Alte Vorlagen funktionieren weiter ohne diese Bausteine.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {structurePlaceholders.map((entry) => (
              <span key={entry.placeholder} className="rounded-md bg-white px-2.5 py-1.5 text-xs font-bold text-blue-700">
                {entry.placeholder}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateRow({
  template,
  onSetActive,
  onDownload,
  onDelete,
}: {
  template: WordTemplate;
  onSetActive: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const isActive = template.status === "Aktiv";

  return (
    <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_150px_120px_260px] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-extrabold text-navy-950">{template.fileName}</div>
        <div className="mt-1 text-sm text-slate-500">Upload: {template.uploadedAt}</div>
      </div>
      <StatusBadge status={template.status} />
      <div className="text-sm font-semibold text-slate-600">{template.placeholders.length} Platzhalter</div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button variant="secondary" className="h-9 px-3" onClick={onSetActive} disabled={isActive}>
          Als aktiv setzen
        </Button>
        <Button variant="secondary" className="h-9 px-3" onClick={onDownload} aria-label={`${template.fileName} herunterladen`}>
          <Download size={15} />
        </Button>
        <Button variant="secondary" className="h-9 px-3" onClick={onDelete} disabled={isActive} aria-label={`${template.fileName} loeschen`}>
          <Trash2 size={15} />
        </Button>
      </div>
    </div>
  );
}

function InfoItem({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div className="break-words text-sm font-extrabold text-navy-950">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: TemplateStatus }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-md px-2.5 py-1 text-xs font-extrabold",
        status === "Aktiv" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600",
      )}
    >
      {status}
    </span>
  );
}

function persistTemplates(templates: WordTemplate[]) {
  saveWordTemplates(templates);
  return templates;
}

function createTestDocumentValues() {
  return Object.fromEntries(
    placeholderCatalog.map((entry) => [entry.key, entry.group === "Schreiben-Struktur" || entry.group === "Anlagen" ? `Testabschnitt: ${entry.label}` : `Testwert: ${entry.label}`]),
  );
}
