"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Archive, CheckCircle2, Clock, Edit3, Filter, Plus, Search, Trash2, X } from "lucide-react";
import {
  TaskFormModal,
  TaskPriorityBadge,
  TaskStatusBadge,
  TaskTypeBadge,
  priorityOptions,
  priorityRank,
  taskTypeOptions,
  type TaskFormValues,
} from "@/components/tasks/task-components";
import { CaseService, CaseServiceAsync, formatStoredDate } from "@/lib/case-service";
import { canEditCase, visibleCases } from "@/lib/auth";
import { useAuth } from "@/lib/use-auth";
import { archiveTask, completeTask, createTask, dismissTask, isTaskOverdue, listTasks, markTaskInProgress, updateTask } from "@/lib/tasks/task-service";
import { generateTaskSuggestions } from "@/lib/tasks/task-suggestions";
import type { CaseTask, CaseTaskPriority, CaseTaskStatus, CaseTaskType, SavedCaseRecord } from "@/types/case";

type TaskRow = {
  record: SavedCaseRecord;
  task: CaseTask;
};

type NewTaskValues = Omit<TaskFormValues, "sourceType" | "sourceLabel" | "contactId" | "organizationId"> & {
  caseId: string;
  contactId?: string;
  organizationId?: string;
};

const statusOptions: Array<{ value: "all" | CaseTaskStatus; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Bearbeitung" },
  { value: "done", label: "Erledigt" },
  { value: "overdue", label: "Überfällig" },
  { value: "archived", label: "Archiviert" },
  { value: "dismissed", label: "Verworfen" },
];

const assignmentOptions = [
  { value: "all", label: "Alle" },
  { value: "mine", label: "Meine" },
  { value: "unassigned", label: "Nicht zugewiesen" },
] as const;

export default function TasksPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CaseTaskStatus>("all");
  const [type, setType] = useState<"all" | CaseTaskType>("all");
  const [priority, setPriority] = useState<"all" | CaseTaskPriority>("all");
  const [assignment, setAssignment] = useState<(typeof assignmentOptions)[number]["value"]>("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyToday, setOnlyToday] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TaskRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const asyncRecords = await CaseServiceAsync.list();
        if (!cancelled) setRecords(asyncRecords);
      } catch (error) {
        console.warn("Async-Aufgabenfälle konnten nicht geladen werden. LocalStorage-Fallback wird genutzt.", error);
        const fallbackRecords = CaseService.list();
        if (!cancelled) {
          setRecords(fallbackRecords);
          setLoadError("Aufgaben konnten nicht aus dem vorbereiteten Online-Repository geladen werden. Lokale Daten werden angezeigt.");
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

  const scopeRecords = useMemo(() => visibleCases(user, records), [records, user]);
  const rows = useMemo(() => collectTaskRows(scopeRecords), [scopeRecords]);
  const filteredRows = useMemo(
    () => filterRows(rows, { query, status, type, priority, assignment, onlyOverdue, onlyToday, userName: user?.name, userId: user?.id }),
    [assignment, onlyOverdue, onlyToday, priority, query, rows, status, type, user?.id, user?.name],
  );
  const stats = useMemo(() => buildStats(rows), [rows]);
  const suggestionCount = useMemo(() => scopeRecords.reduce((sum, record) => sum + generateTaskSuggestions(record).length, 0), [scopeRecords]);

  function saveRecord(nextRecord: SavedCaseRecord) {
    CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
  }

  function refreshUpdatedRecord(record: SavedCaseRecord) {
    setRecords((current) => current.map((item) => (item.id === record.id ? record : item)));
  }

  function persist(nextRecord: SavedCaseRecord) {
    const savedRecord = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    refreshUpdatedRecord(savedRecord);
  }

  function createGlobalTask(values: NewTaskValues) {
    const record = scopeRecords.find((item) => item.id === values.caseId);
    if (!record || !canEditCase(user, record)) return;
    const nextRecord = createTask(record, {
      title: values.title.trim(),
      description: values.description.trim() || undefined,
      type: values.type,
      priority: values.priority,
      dueAt: fromLocalDateTime(values.dueAt),
      remindAt: fromLocalDateTime(values.remindAt),
      assignedToName: values.assignedToName.trim() || undefined,
      contactId: values.contactId || undefined,
      organizationId: values.organizationId || undefined,
      actor: user,
    });
    const savedRecord = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    refreshUpdatedRecord(savedRecord);
    setCreateOpen(false);
  }

  function updateExistingTask(row: TaskRow, values: TaskFormValues) {
    const nextRecord = updateTask(row.record, row.task.id, {
      title: values.title.trim(),
      description: values.description.trim() || undefined,
      type: values.type,
      priority: values.priority,
      dueAt: fromLocalDateTime(values.dueAt),
      remindAt: fromLocalDateTime(values.remindAt),
      assignedToName: values.assignedToName.trim() || undefined,
      contactId: values.contactId || undefined,
      organizationId: values.organizationId || undefined,
      source: values.sourceLabel.trim() ? { type: values.sourceType, label: values.sourceLabel.trim() } : undefined,
      actor: user,
    });
    persist(nextRecord);
    setEditingRow(null);
  }

  function runAction(row: TaskRow, action: "progress" | "done" | "archive" | "dismiss") {
    if (!canEditCase(user, row.record)) return;
    const nextRecord =
      action === "progress"
        ? markTaskInProgress(row.record, row.task.id, user)
        : action === "done"
          ? completeTask(row.record, row.task.id, { actor: user })
          : action === "archive"
            ? archiveTask(row.record, row.task.id, { actor: user })
            : dismissTask(row.record, row.task.id, { actor: user });
    saveRecord(nextRecord);
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-blue-300">MAWA Aufgaben</div>
            <h1 className="mt-1 text-2xl font-extrabold text-white">Aufgaben</h1>
            <p className="mt-1 text-sm text-slate-400">Alle Aufgaben, Erinnerungen, Fristen und Termine aus sichtbaren Fällen.</p>
          </div>
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500">
            <Plus size={16} />
            Neue Aufgabe
          </button>
        </div>

        {loading && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
            Aufgaben werden geladen ...
          </div>
        )}
        {loadError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {loadError}
          </div>
        )}

        <section className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi title="Offen" value={stats.open} tone="blue" />
          <Kpi title="Überfällig" value={stats.overdue} tone="red" />
          <Kpi title="Heute fällig" value={stats.today} tone="orange" />
          <Kpi title="Diese Woche" value={stats.week} tone="violet" />
          <Kpi title="Erledigt" value={stats.done} tone="green" />
          <Kpi title="Nicht zugewiesen" value={stats.unassigned} tone="slate" />
        </section>

        {suggestionCount > 0 && (
          <div className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">
            {suggestionCount === 1 ? "1 automatischer Vorschlag" : `${suggestionCount} automatische Vorschläge`} in sichtbaren Fällen vorhanden.
          </div>
        )}

        <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-white">
            <Filter size={16} />
            Filter
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suche nach Fall, Mieter, Adresse, Titel..." className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm font-semibold text-white outline-none focus:border-blue-500" />
            </label>
            <FilterSelect value={status} onChange={(value) => setStatus(value as "all" | CaseTaskStatus)} options={statusOptions} />
            <FilterSelect value={type} onChange={(value) => setType(value as "all" | CaseTaskType)} options={[{ value: "all", label: "Alle Typen" }, ...taskTypeOptions]} />
            <FilterSelect value={priority} onChange={(value) => setPriority(value as "all" | CaseTaskPriority)} options={[{ value: "all", label: "Alle Prioritäten" }, ...priorityOptions]} />
            <FilterSelect value={assignment} onChange={(value) => setAssignment(value as (typeof assignmentOptions)[number]["value"])} options={assignmentOptions} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Toggle active={onlyOverdue} onClick={() => setOnlyOverdue((value) => !value)} label="Nur überfällige" />
            <Toggle active={onlyToday} onClick={() => setOnlyToday((value) => !value)} label="Nur heute fällige" />
          </div>
        </section>

        {rows.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <section className="rounded-lg border border-slate-800 bg-slate-900/70">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-bold text-slate-400">{filteredRows.length} Aufgabe(n)</div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="bg-slate-950/45 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Priorität</th>
                    <th className="px-4 py-3">Typ</th>
                    <th className="px-4 py-3">Titel</th>
                    <th className="px-4 py-3">Fallnummer</th>
                    <th className="px-4 py-3">Mieter</th>
                    <th className="px-4 py-3">Zuständig</th>
                    <th className="px-4 py-3">Fällig</th>
                    <th className="px-4 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredRows.map((row) => (
                    <TaskTableRow key={`${row.record.id}-${row.task.id}`} row={row} canEdit={canEditCase(user, row.record)} onEdit={() => setEditingRow(row)} onAction={runAction} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-4 lg:hidden">
              {filteredRows.map((row) => (
                <TaskMobileCard key={`${row.record.id}-${row.task.id}`} row={row} canEdit={canEditCase(user, row.record)} onEdit={() => setEditingRow(row)} onAction={runAction} />
              ))}
            </div>
          </section>
        )}

        {createOpen && <GlobalTaskModal records={scopeRecords.filter((record) => canEditCase(user, record))} onClose={() => setCreateOpen(false)} onSubmit={createGlobalTask} />}
        {editingRow && <TaskFormModal title="Aufgabe bearbeiten" task={editingRow.task} onClose={() => setEditingRow(null)} onSubmit={(values) => updateExistingTask(editingRow, values)} />}
      </div>
    </div>
  );
}

function TaskTableRow({ row, canEdit, onEdit, onAction }: { row: TaskRow; canEdit: boolean; onEdit: () => void; onAction: (row: TaskRow, action: "progress" | "done" | "archive" | "dismiss") => void }) {
  return (
    <tr className={isTaskOverdue(row.task) ? "bg-red-500/5" : ""}>
      <td className="px-4 py-3"><TaskStatusBadge status={row.task.status} /></td>
      <td className="px-4 py-3"><TaskPriorityBadge priority={row.task.priority} /></td>
      <td className="px-4 py-3"><TaskTypeBadge type={row.task.type} /></td>
      <td className="px-4 py-3">
        <div className="font-extrabold text-white">{row.task.title}</div>
        {row.task.description && <div className="mt-1 line-clamp-2 max-w-xs text-xs font-semibold text-slate-500">{row.task.description}</div>}
      </td>
      <td className="px-4 py-3"><Link className="font-bold text-blue-300 hover:text-blue-200" href={`/cases/${row.record.id}`}>{row.record.id}</Link></td>
      <td className="px-4 py-3 font-semibold text-slate-300">{row.record.tenant || "Fehlt"}</td>
      <td className="px-4 py-3 font-semibold text-slate-400">{row.task.assignedToName || "Nicht zugewiesen"}</td>
      <td className="px-4 py-3 font-semibold text-slate-400">{formatDue(row.task)}</td>
      <td className="px-4 py-3">
        <TaskActions row={row} canEdit={canEdit} onEdit={onEdit} onAction={onAction} align="right" />
      </td>
    </tr>
  );
}

function TaskMobileCard({ row, canEdit, onEdit, onAction }: { row: TaskRow; canEdit: boolean; onEdit: () => void; onAction: (row: TaskRow, action: "progress" | "done" | "archive" | "dismiss") => void }) {
  return (
    <article className={isTaskOverdue(row.task) ? "rounded-lg border border-red-400/30 bg-red-500/10 p-4" : "rounded-lg border border-slate-800 bg-slate-950/35 p-4"}>
      <div className="flex flex-wrap gap-2">
        <TaskStatusBadge status={row.task.status} />
        <TaskPriorityBadge priority={row.task.priority} />
        <TaskTypeBadge type={row.task.type} />
      </div>
      <div className="mt-3 font-extrabold text-white">{row.task.title}</div>
      <div className="mt-1 text-sm font-semibold text-slate-400">{row.record.id} · {row.record.tenant || "Mieter fehlt"}</div>
      <div className="mt-2 text-xs font-semibold text-slate-500">{formatDue(row.task)} · {row.task.assignedToName || "Nicht zugewiesen"}</div>
      <div className="mt-3">
        <TaskActions row={row} canEdit={canEdit} onEdit={onEdit} onAction={onAction} />
      </div>
    </article>
  );
}

function TaskActions({ row, canEdit, onEdit, onAction, align = "left" }: { row: TaskRow; canEdit: boolean; onEdit: () => void; onAction: (row: TaskRow, action: "progress" | "done" | "archive" | "dismiss") => void; align?: "left" | "right" }) {
  return (
    <div className={`flex flex-wrap gap-2 ${align === "right" ? "justify-end" : ""}`}>
      <Link href={`/cases/${row.record.id}`} className="inline-flex h-8 items-center rounded-md border border-slate-700 px-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800">Zum Fall</Link>
      <IconButton disabled={!canEdit || row.task.status === "in_progress" || row.task.status === "done" || row.task.status === "archived"} onClick={() => onAction(row, "progress")} title="In Bearbeitung"><Clock size={14} /></IconButton>
      <IconButton disabled={!canEdit || row.task.status === "done" || row.task.status === "archived" || row.task.status === "dismissed"} onClick={() => onAction(row, "done")} title="Erledigen"><CheckCircle2 size={14} /></IconButton>
      <IconButton disabled={!canEdit || row.task.status === "archived"} onClick={onEdit} title="Bearbeiten"><Edit3 size={14} /></IconButton>
      <IconButton disabled={!canEdit || row.task.status === "archived"} onClick={() => onAction(row, "archive")} title="Archivieren"><Archive size={14} /></IconButton>
      <IconButton disabled={!canEdit || row.task.status === "dismissed" || row.task.status === "archived"} onClick={() => onAction(row, "dismiss")} title="Verwerfen" danger><Trash2 size={14} /></IconButton>
    </div>
  );
}

function GlobalTaskModal({ records, onSubmit, onClose }: { records: SavedCaseRecord[]; onSubmit: (values: NewTaskValues) => void; onClose: () => void }) {
  const [values, setValues] = useState<NewTaskValues>({
    caseId: records[0]?.id ?? "",
    title: "",
    description: "",
    type: "task",
    priority: "normal",
    dueAt: "",
    remindAt: "",
    assignedToName: "",
  });

  function update<K extends keyof NewTaskValues>(key: K, value: NewTaskValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-slate-950/60">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-white">Neue Aufgabe</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800" aria-label="Schließen"><X size={16} /></button>
        </div>
        {records.length === 0 ? (
          <div className="mt-5 rounded-md border border-amber-400/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">Keine bearbeitbaren Fälle verfügbar.</div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Fall" className="md:col-span-2">
              <select value={values.caseId} onChange={(event) => update("caseId", event.target.value)} className={inputClass}>
                {records.map((record) => <option key={record.id} value={record.id}>{record.id} · {record.tenant || "Mieter fehlt"} · {record.address || "Adresse fehlt"}</option>)}
              </select>
            </Field>
            <Field label="Titel" className="md:col-span-2"><input value={values.title} onChange={(event) => update("title", event.target.value)} className={inputClass} /></Field>
            <Field label="Beschreibung" className="md:col-span-2"><textarea value={values.description} onChange={(event) => update("description", event.target.value)} rows={4} className={inputClass} /></Field>
            <Field label="Typ"><select value={values.type} onChange={(event) => update("type", event.target.value as CaseTaskType)} className={inputClass}>{taskTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
            <Field label="Priorität"><select value={values.priority} onChange={(event) => update("priority", event.target.value as CaseTaskPriority)} className={inputClass}>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
            <Field label="Fällig am"><input type="datetime-local" value={values.dueAt} onChange={(event) => update("dueAt", event.target.value)} className={inputClass} /></Field>
            <Field label="Erinnerung am"><input type="datetime-local" value={values.remindAt} onChange={(event) => update("remindAt", event.target.value)} className={inputClass} /></Field>
            <Field label="Zuständig für" className="md:col-span-2"><input value={values.assignedToName} onChange={(event) => update("assignedToName", event.target.value)} className={inputClass} /></Field>
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">Abbrechen</button>
          <button type="button" disabled={!values.caseId || !values.title.trim()} onClick={() => onSubmit(values)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500">Speichern</button>
        </div>
      </div>
    </div>
  );
}

function collectTaskRows(records: SavedCaseRecord[]) {
  return records
    .flatMap((record) => listTasks(record).map((task) => ({ record, task })))
    .sort(compareRows);
}

function filterRows(
  rows: TaskRow[],
  filters: {
    query: string;
    status: "all" | CaseTaskStatus;
    type: "all" | CaseTaskType;
    priority: "all" | CaseTaskPriority;
    assignment: "all" | "mine" | "unassigned";
    onlyOverdue: boolean;
    onlyToday: boolean;
    userName?: string;
    userId?: string;
  },
) {
  const normalizedQuery = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (normalizedQuery && ![row.record.id, row.record.tenant, row.record.address, row.task.title, row.task.description].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery))) return false;
    if (filters.status !== "all" && row.task.status !== filters.status) return false;
    if (filters.type !== "all" && row.task.type !== filters.type) return false;
    if (filters.priority !== "all" && row.task.priority !== filters.priority) return false;
    if (filters.assignment === "mine" && row.task.assignedTo !== filters.userId && row.task.assignedToName !== filters.userName) return false;
    if (filters.assignment === "unassigned" && (row.task.assignedTo || row.task.assignedToName)) return false;
    if (filters.onlyOverdue && !isTaskOverdue(row.task)) return false;
    if (filters.onlyToday && !isDueToday(row.task)) return false;
    return true;
  });
}

function buildStats(rows: TaskRow[]) {
  return {
    open: rows.filter((row) => row.task.status === "open" || row.task.status === "in_progress").length,
    overdue: rows.filter((row) => row.task.status === "overdue" || isTaskOverdue(row.task)).length,
    today: rows.filter((row) => isDueToday(row.task)).length,
    week: rows.filter((row) => isDueThisWeek(row.task)).length,
    done: rows.filter((row) => row.task.status === "done").length,
    unassigned: rows.filter((row) => !row.task.assignedTo && !row.task.assignedToName).length,
  };
}

function compareRows(a: TaskRow, b: TaskRow) {
  const aOverdue = a.task.status === "overdue" || isTaskOverdue(a.task);
  const bOverdue = b.task.status === "overdue" || isTaskOverdue(b.task);
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
  const priority = priorityRank[a.task.priority] - priorityRank[b.task.priority];
  if (priority !== 0) return priority;
  return getTaskDate(a.task).getTime() - getTaskDate(b.task).getTime();
}

function getTaskDate(task: CaseTask) {
  const date = new Date(task.dueAt ?? task.remindAt ?? task.updatedAt ?? task.createdAt);
  return Number.isNaN(date.getTime()) ? new Date(8640000000000000) : date;
}

function isDueToday(task: CaseTask) {
  const date = parseTaskDate(task);
  return Boolean(date && date.toDateString() === new Date().toDateString());
}

function isDueThisWeek(task: CaseTask) {
  const date = parseTaskDate(task);
  if (!date) return false;
  const start = startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function parseTaskDate(task: CaseTask) {
  const date = new Date(task.dueAt ?? task.remindAt ?? "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

function formatDue(task: CaseTask) {
  if (task.dueAt) return formatStoredDate(task.dueAt);
  if (task.remindAt) return `Erinnerung ${formatStoredDate(task.remindAt)}`;
  return "Nicht gesetzt";
}

function fromLocalDateTime(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function Kpi({ title, value, tone }: { title: string; value: number; tone: "blue" | "red" | "orange" | "violet" | "green" | "slate" }) {
  const className = {
    blue: "text-blue-200",
    red: "text-red-200",
    orange: "text-orange-200",
    violet: "text-violet-200",
    green: "text-emerald-200",
    slate: "text-slate-200",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`mt-4 text-3xl font-extrabold ${className}`}>{value}</div>
    </div>
  );
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: ReadonlyArray<{ value: string; label: string }> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-blue-500">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} className={active ? "rounded-md bg-blue-600 px-3 py-2 text-xs font-bold text-white" : "rounded-md border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"}>{label}</button>;
}

function IconButton({ children, onClick, disabled, title, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; title: string; danger?: boolean }) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={danger ? "grid h-8 w-8 place-items-center rounded-md border border-red-400/25 text-red-200 hover:bg-red-500/10 disabled:border-slate-800 disabled:text-slate-600" : "grid h-8 w-8 place-items-center rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600"}>
      {children}
    </button>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`grid gap-1.5 text-sm font-bold text-slate-300 ${className}`}>{label}{children}</label>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/55 p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-blue-500/10 text-blue-300"><CheckCircle2 size={22} /></div>
      <h2 className="mt-4 text-lg font-extrabold text-white">Noch keine Aufgaben vorhanden</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">Erstellen Sie eine Aufgabe und verknüpfen Sie sie mit einem sichtbaren Fall.</p>
      <button type="button" onClick={onCreate} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500"><Plus size={16} />Neue Aufgabe erstellen</button>
    </div>
  );
}

const inputClass = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-blue-500";
