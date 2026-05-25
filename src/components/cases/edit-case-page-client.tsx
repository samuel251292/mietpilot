"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { NewCaseWizard } from "@/components/cases/new-case-wizard";
import { CaseService } from "@/lib/case-service";
import { canEditCase } from "@/lib/auth";
import { hasFileContent } from "@/lib/storage/file-resolver";
import { useAuth } from "@/lib/use-auth";
import type { SavedCaseRecord } from "@/types/case";

export function EditCasePageClient({ id }: { id: string }) {
  const { user } = useAuth();
  const [record, setRecord] = useState<SavedCaseRecord | undefined>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setRecord(CaseService.get(id));
    setLoaded(true);
  }, [id]);

  if (loaded && !record) {
    return (
      <Card>
        <CardContent>
          <div className="text-lg font-extrabold text-navy-950">Fall nicht gefunden</div>
          <Link className="mt-3 inline-flex text-sm font-semibold text-blue-700" href="/cases">Zur Fallliste</Link>
        </CardContent>
      </Card>
    );
  }

  if (!record) return null;

  if (!canEditCase(user, record)) {
    return (
      <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
        <div className="rounded-lg border border-amber-400/30 bg-amber-950/15 p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-200">
              <AlertTriangle size={22} />
            </div>
            <div>
              <div className="text-lg font-extrabold text-white">Keine Bearbeitungsberechtigung</div>
              <p className="mt-1 text-sm leading-6 text-amber-100/80">Dieser Fall ist nur lesbar oder nicht für dich freigegeben.</p>
              <Link className="mt-4 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500" href={`/cases/${record.id}`}>Fall ansehen</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-sm shadow-slate-950/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wide text-blue-300">Edit-Modus</div>
              <h1 className="mt-1 text-3xl font-extrabold text-white">Fall bearbeiten</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-lg font-extrabold text-white">{record.id}</span>
                <StatusBadge status={record.status} />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{record.tenant || "Mieter fehlt"} · {record.address || "Adresse fehlt"}</p>
            </div>
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold leading-6 text-emerald-100">
              <div className="flex items-center gap-2 font-extrabold">
                <CheckCircle2 size={16} />
                Bestehende Daten und Dokumente bleiben erhalten.
              </div>
              <div className="mt-1 text-xs text-emerald-100/75">Owner, Freigaben, Schreiben und Exportstatus werden beim Speichern weitergeführt.</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <EditInfo label="Dokumente" value={`${record.documents.length} gespeichert`} />
            <EditInfo label="Word" value={hasFileContent(record.generatedWord) ? "erstellt" : "nicht generiert"} />
            <EditInfo label="PDF" value={hasFileContent(record.generatedPdf) ? "erstellt" : "nicht generiert"} />
          </div>
        </section>
        <NewCaseWizard record={record} editMode />
      </div>
    </div>
  );
}

function EditInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
      <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
        <FileText size={14} />
        {label}
      </div>
      <div className="mt-2 text-sm font-bold text-white">{value}</div>
    </div>
  );
}
