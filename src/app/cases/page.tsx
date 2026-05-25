"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CaseFilters,
  CaseListHeader,
  CaseMobileCards,
  CaseStatusSegments,
  CaseTable,
  CasesEmptyState,
  type CaseOwnerFilter,
  type CaseSegment,
  type CaseSegmentId,
  type CaseStatusFilter,
} from "@/components/cases/case-list-components";
import { CaseService, CaseServiceAsync } from "@/lib/case-service";
import { demoUsers, visibleCases, type PublicUser } from "@/lib/auth";
import { useAuth } from "@/lib/use-auth";
import type { SavedCaseRecord } from "@/types/case";

export default function CasesPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CaseStatusFilter>("all");
  const [owner, setOwner] = useState<CaseOwnerFilter>("all");
  const [segment, setSegment] = useState<CaseSegmentId>("all");
  const [shareCase, setShareCase] = useState<SavedCaseRecord | null>(null);
  const employees = demoUsers.filter((item) => item.role === "employee");
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const asyncRecords = await CaseServiceAsync.list();
        if (!cancelled) setRecords(asyncRecords);
      } catch (error) {
        console.warn("Async-Fallliste konnte nicht geladen werden. LocalStorage-Fallback wird genutzt.", error);
        const fallbackRecords = CaseService.list();
        if (!cancelled) {
          setRecords(fallbackRecords);
          setLoadError("Fallliste konnte nicht aus dem vorbereiteten Online-Repository geladen werden. Lokale Daten werden angezeigt.");
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

  const scopeRecords = useMemo(() => (isAdmin ? records : visibleCases(user, records)), [isAdmin, records, user]);

  const segments = useMemo<CaseSegment[]>(() => {
    return [
      { id: "all", label: "Alle", count: scopeRecords.length },
      { id: "new", label: "Neu", count: scopeRecords.filter(isNewCase).length },
      { id: "active", label: "In Bearbeitung", count: scopeRecords.filter(isActiveCase).length },
      { id: "letter", label: "Schreiben erstellt", count: scopeRecords.filter((record) => record.status === "Schreiben erstellt").length },
      { id: "closed", label: "Abgeschlossen", count: scopeRecords.filter((record) => record.status === "Abgeschlossen").length },
      { id: "shared", label: "Geteilt mit mir", count: scopeRecords.filter((record) => isSharedWithCurrentUser(record, user)).length },
      { id: "unassigned", label: "Nicht zugewiesen", count: scopeRecords.filter((record) => !record.ownerId).length },
    ];
  }, [scopeRecords, user]);

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scopeRecords.filter((record) => {
      const searchable = [record.id, record.tenant, record.address, record.ownerName ?? ""].join(" ").toLowerCase();
      const matchesQuery = !needle || searchable.includes(needle);
      const matchesStatus = status === "all" || record.status === status;
      const matchesOwner = !isAdmin || owner === "all" || (owner === "unassigned" ? !record.ownerId : record.ownerId === owner);
      const matchesSegment = matchesSegmentFilter(record, segment, user);

      return matchesQuery && matchesStatus && matchesOwner && matchesSegment;
    });
  }, [isAdmin, owner, query, scopeRecords, segment, status, user]);

  async function deleteCase(id: string) {
    if (!window.confirm("Möchten Sie diesen Fall wirklich löschen?")) return;
    setActionError("");
    try {
      await CaseServiceAsync.delete(id, user);
      setRecords((current) => current.filter((record) => record.id !== id));
    } catch (error) {
      console.warn("Async-Löschen konnte nicht ausgeführt werden. LocalStorage-Fallback wird genutzt.", error);
      CaseService.delete(id, user);
      setRecords((current) => current.filter((record) => record.id !== id));
      setActionError("Fall konnte nicht im vorbereiteten Online-Repository gelöscht werden. Lokaler Fallback wurde verwendet.");
    }
  }

  async function completeCase(id: string) {
    setActionError("");
    try {
      const nextRecord = await CaseServiceAsync.complete(id, user);
      if (nextRecord) setRecords((current) => current.map((record) => (record.id === nextRecord.id ? nextRecord : record)));
    } catch (error) {
      console.warn("Async-Abschließen konnte nicht ausgeführt werden. LocalStorage-Fallback wird genutzt.", error);
      const nextRecord = CaseService.complete(id, user);
      if (nextRecord) setRecords((current) => current.map((record) => (record.id === nextRecord.id ? nextRecord : record)));
      setActionError("Fall konnte nicht im vorbereiteten Online-Repository abgeschlossen werden. Lokaler Fallback wurde verwendet.");
    }
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <CaseListHeader />
        {loading && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
            Fälle werden geladen ...
          </div>
        )}
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
        <CaseStatusSegments segments={segments} activeSegment={segment} onChange={setSegment} />
        <CaseFilters
          query={query}
          status={status}
          owner={owner}
          employees={employees}
          isAdmin={Boolean(isAdmin)}
          onQueryChange={setQuery}
          onStatusChange={setStatus}
          onOwnerChange={setOwner}
        />

        {scopeRecords.length === 0 ? (
          <CasesEmptyState />
        ) : (
          <>
            {filteredRecords.length > 0 ? (
              <>
                <CaseTable records={filteredRecords} user={user} actions={{ onShare: setShareCase, onComplete: completeCase, onDelete: deleteCase }} />
                <CaseMobileCards records={filteredRecords} user={user} actions={{ onShare: setShareCase, onComplete: completeCase, onDelete: deleteCase }} />
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/55 p-8 text-center text-sm font-semibold text-slate-400">
                Keine Fälle für die aktuellen Filter gefunden.
              </div>
            )}
          </>
        )}
      </div>
      {shareCase && user && (
        <ShareDialog
          record={shareCase}
          currentUser={user}
          onShared={(nextRecord, message) => {
            setRecords((current) => current.map((record) => (record.id === nextRecord.id ? nextRecord : record)));
            if (message) setActionError(message);
          }}
          onClose={() => setShareCase(null)}
        />
      )}
    </div>
  );
}

function ShareDialog({
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
      const nextRecord = await CaseServiceAsync.share(record.id, userId, permission, currentUser);
      if (nextRecord) onShared(nextRecord);
      onClose();
    } catch (shareError) {
      console.warn("Async-Teilen konnte nicht ausgeführt werden. LocalStorage-Fallback wird genutzt.", shareError);
      const nextRecord = CaseService.share(record.id, userId, permission, currentUser);
      if (nextRecord) {
        onShared(nextRecord, "Fallfreigabe konnte nicht im vorbereiteten Online-Repository gespeichert werden. Lokaler Fallback wurde verwendet.");
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

function matchesSegmentFilter(record: SavedCaseRecord, segment: CaseSegmentId, user: PublicUser | null) {
  if (segment === "all") return true;
  if (segment === "new") return isNewCase(record);
  if (segment === "active") return isActiveCase(record);
  if (segment === "letter") return record.status === "Schreiben erstellt";
  if (segment === "closed") return record.status === "Abgeschlossen";
  if (segment === "shared") return isSharedWithCurrentUser(record, user);
  return !record.ownerId;
}

function isNewCase(record: SavedCaseRecord) {
  return record.status === "Entwurf";
}

function isActiveCase(record: SavedCaseRecord) {
  return ["Dokumente hochgeladen", "Daten geprüft", "Berechnung abgeschlossen"].includes(record.status);
}

function isSharedWithCurrentUser(record: SavedCaseRecord, user: PublicUser | null) {
  if (!user) return false;
  return record.ownerId !== user.id && (record.sharedWith ?? []).some((share) => share.userId === user.id);
}
