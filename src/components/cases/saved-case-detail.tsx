"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CaseActivityPanel,
  CaseCalculationPanel,
  CaseDangerZone,
  CaseDetailHeader,
  caseDetailTabs,
  type CaseDetailTab,
  CaseDocumentsPanel,
  CaseExportPanel,
  CaseExtractedDataPanel,
  CaseLetterPanel,
  CasePartiesPanel,
  CaseQuickStats,
  CaseTabsShell,
  CaseWorkflowTimeline,
} from "@/components/cases/case-detail-components";
import { CommunicationThreadList } from "@/components/communication/communication-components";
import { CaseCalendarPanel } from "@/components/calendar/case-calendar-components";
import { TaskList } from "@/components/tasks/task-components";
import { Card, CardContent } from "@/components/ui/card";
import { CaseService, CaseServiceAsync } from "@/lib/case-service";
import { canEditCase, canViewCase, demoUsers, type PublicUser } from "@/lib/auth";
import { useAuth } from "@/lib/use-auth";
import type { SavedCaseRecord } from "@/types/case";

export function SavedCaseDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [record, setRecord] = useState<SavedCaseRecord | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [activeTab, setActiveTab] = useState<CaseDetailTab>(caseDetailTabs[0]);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoaded(false);
      setLoadError("");
      try {
        const asyncRecord = await CaseServiceAsync.get(id);
        if (!cancelled) setRecord(asyncRecord ?? undefined);
      } catch (error) {
        console.warn("Async-Falldetail konnte nicht geladen werden. LocalStorage-Fallback wird genutzt.", error);
        const fallbackRecord = CaseService.get(id);
        if (!cancelled) {
          setRecord(fallbackRecord);
          setLoadError("Falldaten konnten nicht aus dem vorbereiteten Online-Repository geladen werden. Lokale Daten werden angezeigt.");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function completeCase() {
    setActionError("");
    try {
      const next = await CaseServiceAsync.complete(id, user);
      if (next) setRecord(next);
    } catch (error) {
      console.warn("Async-Abschließen konnte nicht ausgeführt werden. LocalStorage-Fallback wird genutzt.", error);
      const next = CaseService.complete(id, user);
      if (next) setRecord(next);
      setActionError("Fall konnte nicht im vorbereiteten Online-Repository abgeschlossen werden. Lokaler Fallback wurde verwendet.");
    }
  }

  async function deleteCase() {
    if (!record) return;
    if (!window.confirm("Möchten Sie diesen Fall wirklich löschen?")) return;
    setActionError("");
    try {
      await CaseServiceAsync.delete(record.id, user);
    } catch (error) {
      console.warn("Async-Löschen konnte nicht ausgeführt werden. LocalStorage-Fallback wird genutzt.", error);
      CaseService.delete(record.id, user);
    }
    router.push("/cases");
  }

  if (!loaded) {
    return (
      <Card>
        <CardContent>
          <div className="text-lg font-extrabold text-navy-950">Fall wird geladen</div>
          <p className="mt-2 text-sm font-semibold text-slate-600">Die Falldaten werden aus der vorbereiteten Datenquelle geladen.</p>
        </CardContent>
      </Card>
    );
  }

  if (!record) {
    return (
      <Card>
        <CardContent>
          <div className="text-lg font-extrabold text-navy-950">Fall nicht gefunden</div>
          <Link className="mt-3 inline-flex text-sm font-semibold text-blue-700" href="/cases">Zur Fallliste</Link>
        </CardContent>
      </Card>
    );
  }

  if (!canViewCase(user, record)) {
    return (
      <Card>
        <CardContent>
          <div className="text-lg font-extrabold text-navy-950">Kein Zugriff auf diesen Fall</div>
          <Link className="mt-3 inline-flex text-sm font-semibold text-blue-700" href="/cases">Zur Fallliste</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <CaseDetailHeader
          record={record}
          user={user}
          actions={{
            onShare: () => setShareOpen(true),
            onComplete: completeCase,
            onDelete: deleteCase,
          }}
        />
        {loadError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {loadError}
          </div>
        )}
        {actionError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {actionError}
          </div>
        )}
        <CaseQuickStats record={record} />

        {shareOpen && user && (
          <DetailShareDialog
            record={record}
            currentUser={user}
            onShared={(nextRecord, message) => {
              setRecord(nextRecord);
              if (message) setActionError(message);
            }}
            onClose={() => setShareOpen(false)}
          />
        )}

        <CaseTabsShell activeTab={activeTab} onTabChange={setActiveTab}>
          {activeTab === "Übersicht" && (
            <div className="grid gap-5">
              <CasePartiesPanel record={record} />
              <CaseWorkflowTimeline record={record} />
              <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                <CaseActivityPanel record={record} />
                <CaseDangerZone canEdit={canEditCase(user, record)} onDelete={deleteCase} />
              </div>
            </div>
          )}
          {activeTab === "Dokumente" && <CaseDocumentsPanel record={record} onRecordChange={setRecord} />}
          {activeTab === "Erkannte Daten" && <CaseExtractedDataPanel record={record} />}
          {activeTab === "Berechnung" && <CaseCalculationPanel record={record} />}
          {activeTab === "Vergleichsschreiben" && <CaseLetterPanel record={record} onRecordChange={setRecord} />}
          {activeTab === "Kommunikation" && <CommunicationThreadList record={record} user={user} onRecordChange={setRecord} onOpenLetters={() => setActiveTab("Vergleichsschreiben")} />}
          {activeTab === "Aufgaben" && <TaskList record={record} user={user} onRecordChange={setRecord} />}
          {activeTab === "Termine" && <CaseCalendarPanel record={record} user={user} onRecordChange={setRecord} />}
          {activeTab === "Export" && <CaseExportPanel record={record} onRecordChange={setRecord} />}
        </CaseTabsShell>
      </div>
    </div>
  );
}

function DetailShareDialog({
  record,
  currentUser,
  onShared,
  onClose,
}: {
  record: SavedCaseRecord;
  currentUser: PublicUser;
  onShared: (record: SavedCaseRecord, message?: string) => void;
  onClose: () => void;
}) {
  const employees = demoUsers.filter((item) => item.role === "employee" && item.id !== record.ownerId);
  const [userId, setUserId] = useState(employees[0]?.id ?? "");
  const [permission, setPermission] = useState<"read" | "write">("read");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function share() {
    if (!userId || saving) return;
    setSaving(true);
    setError("");
    try {
      const next = await CaseServiceAsync.share(record.id, userId, permission, currentUser);
      if (next) onShared(next);
      onClose();
    } catch (shareError) {
      console.warn("Async-Teilen konnte nicht ausgeführt werden. LocalStorage-Fallback wird genutzt.", shareError);
      const next = CaseService.share(record.id, userId, permission, currentUser);
      if (next) {
        onShared(next, "Fallfreigabe konnte nicht im vorbereiteten Online-Repository gespeichert werden. Lokaler Fallback wurde verwendet.");
        onClose();
        return;
      }
      setError("Fallfreigabe konnte nicht gespeichert werden.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-slate-950/40">
        <h2 className="text-lg font-extrabold text-white">Fall teilen</h2>
        <p className="mt-1 text-sm text-slate-400">{record.id} · {record.tenant || "-"}</p>
        {error && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">
            {error}
          </div>
        )}
        <div className="mt-5 grid gap-4">
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Mitarbeiter</span>
            <select value={userId} onChange={(event) => setUserId(event.target.value)} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 text-sm font-semibold text-white outline-none focus:border-blue-500">
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Berechtigung</span>
            <select value={permission} onChange={(event) => setPermission(event.target.value as "read" | "write")} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 text-sm font-semibold text-white outline-none focus:border-blue-500">
              <option value="read">Nur lesen</option>
              <option value="write">Bearbeiten</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-800">Abbrechen</button>
          <button onClick={share} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Wird geteilt ..." : "Teilen"}
          </button>
        </div>
      </div>
    </div>
  );
}
