"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Archive, Bell, CalendarDays, CheckCircle2, CircleDot, Clock, Edit3, Flag, ListChecks, Plus, Trash2, X } from "lucide-react";
import { CaseService, formatStoredDate } from "@/lib/case-service";
import { canEditCase, type PublicUser } from "@/lib/auth";
import { buildContactsFromCase, buildOrganizationsFromCase, findContactsByCase, findOrganizationsByCase } from "@/lib/crm/crm-service";
import { archiveTask, completeTask, createTask, dismissTask, isTaskOverdue, listTasks, markTaskInProgress, updateTask } from "@/lib/tasks/task-service";
import { applyAllTaskSuggestions, applyTaskSuggestion, generateTaskSuggestions } from "@/lib/tasks/task-suggestions";
import type { CaseTask, CaseTaskPriority, CaseTaskSource, CaseTaskStatus, CaseTaskType, SavedCaseRecord, TaskSuggestion } from "@/types/case";
import type { CRMContact, CRMOrganization } from "@/types/crm";

type TaskListProps = {
  record: SavedCaseRecord;
  user: PublicUser | null;
  onRecordChange: (record: SavedCaseRecord) => void;
};

export type TaskFormValues = {
  title: string;
  description: string;
  type: CaseTaskType;
  priority: CaseTaskPriority;
  dueAt: string;
  remindAt: string;
  assignedToName: string;
  contactId: string;
  organizationId: string;
  sourceType: CaseTaskSource["type"];
  sourceLabel: string;
};

export const taskTypeOptions: Array<{ value: CaseTaskType; label: string }> = [
  { value: "task", label: "Aufgabe" },
  { value: "reminder", label: "Erinnerung" },
  { value: "deadline", label: "Frist" },
  { value: "follow_up", label: "Follow-up" },
  { value: "appointment", label: "Termin" },
  { value: "hearing", label: "Verhandlung" },
  { value: "visit", label: "Besichtigung" },
];

export const priorityOptions: Array<{ value: CaseTaskPriority; label: string }> = [
  { value: "low", label: "Niedrig" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Hoch" },
  { value: "urgent", label: "Dringend" },
];

const sourceTypeOptions: Array<{ value: CaseTaskSource["type"]; label: string }> = [
  { value: "manual", label: "Manuell" },
  { value: "communication", label: "Kommunikation" },
  { value: "document", label: "Dokument" },
  { value: "letter", label: "Schreiben" },
  { value: "calculation", label: "Berechnung" },
  { value: "case", label: "Fall" },
];

export const priorityRank: Record<CaseTaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function TaskList({ record, user, onRecordChange }: TaskListProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CaseTask | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const canEdit = canEditCase(user, record);

  const groupedTasks = useMemo(() => groupTasks(listTasks(record)), [record]);
  const suggestions = useMemo(() => generateTaskSuggestions(record), [record]);
  const crmContacts = useMemo(() => mergeContacts([...findContactsByCase(record.id), ...buildContactsFromCase(record)]), [record]);
  const crmOrganizations = useMemo(() => mergeOrganizations([...findOrganizationsByCase(record.id), ...buildOrganizationsFromCase(record)]), [record]);

  function saveRecord(nextRecord: SavedCaseRecord) {
    const savedRecord = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    onRecordChange(savedRecord);
  }

  function create(values: TaskFormValues) {
    saveRecord(createTask(record, { ...valuesToTaskInput(values), actor: user }));
    setFormOpen(false);
  }

  function update(task: CaseTask, values: TaskFormValues) {
    saveRecord(updateTask(record, task.id, { ...valuesToTaskUpdate(values), actor: user }));
    setEditingTask(null);
  }

  function setInProgress(task: CaseTask) {
    saveRecord(markTaskInProgress(record, task.id, user));
  }

  function complete(task: CaseTask) {
    saveRecord(completeTask(record, task.id, { actor: user }));
  }

  function archive(task: CaseTask) {
    saveRecord(archiveTask(record, task.id, { actor: user }));
  }

  function dismiss(task: CaseTask) {
    saveRecord(dismissTask(record, task.id, { actor: user }));
  }

  function applySuggestion(suggestion: TaskSuggestion) {
    saveRecord(applyTaskSuggestion(record, suggestion));
  }

  function applyAllSuggestions() {
    saveRecord(applyAllTaskSuggestions(record));
  }

  const hasTasks = groupedTasks.overdue.length + groupedTasks.open.length + groupedTasks.done.length + groupedTasks.archived.length > 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-white">Aufgaben</h2>
          <p className="mt-1 text-sm text-slate-400">Aufgaben, Erinnerungen, Fristen und Follow-ups zu diesem Fall.</p>
        </div>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setFormOpen(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500"
        >
          <Plus size={16} />
          Neue Aufgabe
        </button>
      </div>

      <TaskSuggestionsPanel suggestions={suggestions} canEdit={canEdit} onApply={applySuggestion} onApplyAll={applyAllSuggestions} />

      {!hasTasks && <TaskEmptyState canEdit={canEdit} onCreate={() => setFormOpen(true)} />}

      {groupedTasks.overdue.length > 0 && <TaskSection title="Überfällig" tone="red" tasks={groupedTasks.overdue} canEdit={canEdit} onEdit={setEditingTask} onProgress={setInProgress} onComplete={complete} onArchive={archive} onDismiss={dismiss} />}
      {groupedTasks.open.length > 0 && <TaskSection title="Offen" tone="blue" tasks={groupedTasks.open} canEdit={canEdit} onEdit={setEditingTask} onProgress={setInProgress} onComplete={complete} onArchive={archive} onDismiss={dismiss} />}
      {groupedTasks.done.length > 0 && <TaskSection title="Erledigt" tone="green" tasks={groupedTasks.done} canEdit={canEdit} onEdit={setEditingTask} onProgress={setInProgress} onComplete={complete} onArchive={archive} onDismiss={dismiss} />}

      {groupedTasks.archived.length > 0 && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/70">
          <button type="button" onClick={() => setShowArchived((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
            <span className="text-sm font-extrabold text-slate-200">Archiviert und verworfen</span>
            <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-300">{groupedTasks.archived.length}</span>
          </button>
          {showArchived && <div className="grid gap-3 border-t border-slate-800 p-4">{groupedTasks.archived.map((task) => <TaskCard key={task.id} task={task} canEdit={canEdit} onEdit={() => setEditingTask(task)} onProgress={() => setInProgress(task)} onComplete={() => complete(task)} onArchive={() => archive(task)} onDismiss={() => dismiss(task)} />)}</div>}
        </section>
      )}

      {formOpen && <TaskFormModal title="Neue Aufgabe" contacts={crmContacts} organizations={crmOrganizations} onClose={() => setFormOpen(false)} onSubmit={create} />}
      {editingTask && <TaskFormModal title="Aufgabe bearbeiten" contacts={crmContacts} organizations={crmOrganizations} task={editingTask} onClose={() => setEditingTask(null)} onSubmit={(values) => update(editingTask, values)} />}
    </div>
  );
}

function TaskSuggestionsPanel({
  suggestions,
  canEdit,
  onApply,
  onApplyAll,
}: {
  suggestions: TaskSuggestion[];
  canEdit: boolean;
  onApply: (suggestion: TaskSuggestion) => void;
  onApplyAll: () => void;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-white">Automatische Vorschläge</h3>
          <p className="mt-1 text-sm text-slate-400">{suggestions.length > 0 ? "Aus Dokumenten, Schreiben, Kommunikation und Berechnung erkannt." : "Keine automatischen Vorschläge vorhanden."}</p>
        </div>
        {suggestions.length > 0 && (
          <button
            type="button"
            disabled={!canEdit}
            onClick={onApplyAll}
            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500"
          >
            Alle übernehmen
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="mt-4 grid gap-3">
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className="rounded-lg border border-slate-800 bg-slate-950/35 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <TaskPriorityBadge priority={suggestion.priority} />
                    <TaskTypeBadge type={suggestion.type} />
                    {suggestion.source?.label && <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-300">{suggestion.source.label}</span>}
                  </div>
                  <div className="mt-3 font-extrabold text-white">{suggestion.title}</div>
                  {suggestion.description && <div className="mt-1 text-sm font-semibold text-slate-400">{suggestion.description}</div>}
                  <div className="mt-2 text-xs font-semibold text-amber-200">Grund: {suggestion.reason}</div>
                </div>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onApply(suggestion)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600"
                >
                  Übernehmen
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TaskSection({
  title,
  tone,
  tasks,
  canEdit,
  onEdit,
  onProgress,
  onComplete,
  onArchive,
  onDismiss,
}: {
  title: string;
  tone: "red" | "blue" | "green";
  tasks: CaseTask[];
  canEdit: boolean;
  onEdit: (task: CaseTask) => void;
  onProgress: (task: CaseTask) => void;
  onComplete: (task: CaseTask) => void;
  onArchive: (task: CaseTask) => void;
  onDismiss: (task: CaseTask) => void;
}) {
  const toneClass = tone === "red" ? "text-red-200" : tone === "green" ? "text-emerald-200" : "text-blue-200";
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className={`text-sm font-extrabold ${toneClass}`}>{title}</h3>
        <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-300">{tasks.length}</span>
      </div>
      <div className="grid gap-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} canEdit={canEdit} onEdit={() => onEdit(task)} onProgress={() => onProgress(task)} onComplete={() => onComplete(task)} onArchive={() => onArchive(task)} onDismiss={() => onDismiss(task)} />
        ))}
      </div>
    </section>
  );
}

export function TaskCard({
  task,
  canEdit,
  onEdit,
  onProgress,
  onComplete,
  onArchive,
  onDismiss,
}: {
  task: CaseTask;
  canEdit: boolean;
  onEdit: () => void;
  onProgress: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onDismiss: () => void;
}) {
  const overdue = task.status === "overdue" || isTaskOverdue(task);
  const dateText = formatTaskDates(task);

  return (
    <article className={overdue ? "rounded-lg border border-red-400/30 bg-red-500/10 p-4" : "rounded-lg border border-slate-800 bg-slate-950/35 p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            <TaskPriorityBadge priority={task.priority} />
            <TaskTypeBadge type={task.type} />
            {overdue && <span className="rounded-md bg-red-500/15 px-2 py-1 text-xs font-extrabold text-red-200">Überfällig</span>}
          </div>
          <h3 className="mt-3 text-base font-extrabold text-white">{task.title}</h3>
          {task.description && <p className="mt-2 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-slate-300">{task.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
            {dateText && <span className="rounded-md bg-slate-900 px-2 py-1">{dateText}</span>}
            {task.assignedToName && <span className="rounded-md bg-slate-900 px-2 py-1">Zuständig: {task.assignedToName}</span>}
            {task.source?.label && <span className="rounded-md bg-slate-900 px-2 py-1">Quelle: {task.source.label}</span>}
            <span className="rounded-md bg-slate-900 px-2 py-1">Aktualisiert {formatStoredDate(task.updatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <TaskActionButton disabled={!canEdit || task.status === "in_progress" || task.status === "done" || task.status === "archived"} onClick={onProgress}>
            <Clock size={14} />
            In Bearbeitung
          </TaskActionButton>
          <TaskActionButton disabled={!canEdit || task.status === "done" || task.status === "archived" || task.status === "dismissed"} onClick={onComplete}>
            <CheckCircle2 size={14} />
            Erledigen
          </TaskActionButton>
          <TaskActionButton disabled={!canEdit || task.status === "archived"} onClick={onEdit}>
            <Edit3 size={14} />
            Bearbeiten
          </TaskActionButton>
          <TaskActionButton disabled={!canEdit || task.status === "archived"} onClick={onArchive}>
            <Archive size={14} />
            Archivieren
          </TaskActionButton>
          <TaskActionButton disabled={!canEdit || task.status === "dismissed" || task.status === "archived"} onClick={onDismiss} danger>
            <Trash2 size={14} />
            Verwerfen
          </TaskActionButton>
        </div>
      </div>
    </article>
  );
}

export function TaskStatusBadge({ status }: { status: CaseTaskStatus }) {
  const label = statusLabel(status);
  const className =
    status === "overdue"
      ? "bg-red-500/15 text-red-200 ring-red-400/25"
      : status === "done"
        ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25"
        : status === "in_progress"
          ? "bg-blue-500/15 text-blue-200 ring-blue-400/25"
          : status === "archived" || status === "dismissed"
            ? "bg-slate-800 text-slate-400 ring-slate-700"
            : "bg-amber-500/15 text-amber-200 ring-amber-400/25";
  return <span className={`rounded-md px-2 py-1 text-xs font-extrabold ring-1 ${className}`}>{label}</span>;
}

export function TaskPriorityBadge({ priority }: { priority: CaseTaskPriority }) {
  const className =
    priority === "urgent"
      ? "bg-red-500/15 text-red-200"
      : priority === "high"
        ? "bg-orange-500/15 text-orange-200"
        : priority === "low"
          ? "bg-slate-800 text-slate-300"
          : "bg-blue-500/15 text-blue-200";
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-extrabold ${className}`}><Flag size={12} />{priorityLabel(priority)}</span>;
}

export function TaskTypeBadge({ type }: { type: CaseTaskType }) {
  const Icon = type === "appointment" || type === "hearing" || type === "visit" ? CalendarDays : type === "reminder" ? Bell : type === "deadline" ? Clock : ListChecks;
  return <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-200"><Icon size={12} />{typeLabel(type)}</span>;
}

export function TaskFormModal({
  title,
  task,
  contacts = [],
  organizations = [],
  onSubmit,
  onClose,
}: {
  title: string;
  task?: CaseTask;
  contacts?: CRMContact[];
  organizations?: CRMOrganization[];
  onSubmit: (values: TaskFormValues) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<TaskFormValues>(() => taskToFormValues(task));

  function update<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    if (!values.title.trim()) return;
    onSubmit(values);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-slate-950/60">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800" aria-label="Schließen">
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Titel" className="md:col-span-2">
            <input value={values.title} onChange={(event) => update("title", event.target.value)} className={inputClass} />
          </Field>
          <Field label="Beschreibung" className="md:col-span-2">
            <textarea value={values.description} onChange={(event) => update("description", event.target.value)} rows={4} className={inputClass} />
          </Field>
          <Field label="Typ">
            <select value={values.type} onChange={(event) => update("type", event.target.value as CaseTaskType)} className={inputClass}>
              {taskTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Priorität">
            <select value={values.priority} onChange={(event) => update("priority", event.target.value as CaseTaskPriority)} className={inputClass}>
              {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Fällig am">
            <input type="datetime-local" value={values.dueAt} onChange={(event) => update("dueAt", event.target.value)} className={inputClass} />
          </Field>
          <Field label="Erinnerung am">
            <input type="datetime-local" value={values.remindAt} onChange={(event) => update("remindAt", event.target.value)} className={inputClass} />
          </Field>
          <Field label="Zuständig für">
            <input value={values.assignedToName} onChange={(event) => update("assignedToName", event.target.value)} className={inputClass} />
          </Field>
          <Field label="CRM-Kontakt">
            <select value={values.contactId} onChange={(event) => update("contactId", event.target.value)} className={inputClass}>
              <option value="">Kein Kontakt</option>
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
            </select>
          </Field>
          <Field label="CRM-Organisation">
            <select value={values.organizationId} onChange={(event) => update("organizationId", event.target.value)} className={inputClass}>
              <option value="">Keine Organisation</option>
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </Field>
          <Field label="Quelle">
            <select value={values.sourceType} onChange={(event) => update("sourceType", event.target.value as CaseTaskSource["type"])} className={inputClass}>
              {sourceTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Quellenhinweis" className="md:col-span-2">
            <input value={values.sourceLabel} onChange={(event) => update("sourceLabel", event.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">Abbrechen</button>
          <button type="button" onClick={submit} disabled={!values.title.trim()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500">Speichern</button>
        </div>
      </div>
    </div>
  );
}

export function TaskEmptyState({ canEdit, onCreate }: { canEdit: boolean; onCreate: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/55 p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-blue-500/10 text-blue-300">
        <CircleDot size={22} />
      </div>
      <h3 className="mt-4 text-base font-extrabold text-white">Noch keine Aufgaben vorhanden</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">Erstellen Sie Aufgaben, Wiedervorlagen, Fristen oder Termine direkt zu diesem Fall.</p>
      {canEdit && (
        <button type="button" onClick={onCreate} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500">
          <Plus size={16} />
          Neue Aufgabe
        </button>
      )}
    </div>
  );
}

function groupTasks(tasks: CaseTask[]) {
  const sorted = [...tasks].sort(compareTasks);
  return {
    overdue: sorted.filter((task) => task.status === "overdue" || isTaskOverdue(task)),
    open: sorted.filter((task) => !["overdue", "done", "archived", "dismissed"].includes(task.status) && !isTaskOverdue(task)),
    done: sorted.filter((task) => task.status === "done"),
    archived: sorted.filter((task) => task.status === "archived" || task.status === "dismissed"),
  };
}

function compareTasks(a: CaseTask, b: CaseTask) {
  const aOverdue = a.status === "overdue" || isTaskOverdue(a);
  const bOverdue = b.status === "overdue" || isTaskOverdue(b);
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
  const priority = priorityRank[a.priority] - priorityRank[b.priority];
  if (priority !== 0) return priority;
  return getSortDate(a).getTime() - getSortDate(b).getTime();
}

function getSortDate(task: CaseTask) {
  const value = task.dueAt ?? task.remindAt ?? task.updatedAt ?? task.createdAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(8640000000000000) : date;
}

function valuesToTaskInput(values: TaskFormValues) {
  return {
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    type: values.type,
    priority: values.priority,
    dueAt: fromLocalDateTime(values.dueAt),
    remindAt: fromLocalDateTime(values.remindAt),
    assignedToName: values.assignedToName.trim() || undefined,
    contactId: values.contactId || undefined,
    organizationId: values.organizationId || undefined,
    source: buildSource(values),
  };
}

function valuesToTaskUpdate(values: TaskFormValues) {
  return valuesToTaskInput(values);
}

function buildSource(values: TaskFormValues): CaseTaskSource | undefined {
  const label = values.sourceLabel.trim();
  if (!label && values.sourceType === "manual") return undefined;
  return { type: values.sourceType, label: label || sourceTypeOptions.find((option) => option.value === values.sourceType)?.label };
}

function taskToFormValues(task?: CaseTask): TaskFormValues {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    type: task?.type ?? "task",
    priority: task?.priority ?? "normal",
    dueAt: toLocalDateTime(task?.dueAt),
    remindAt: toLocalDateTime(task?.remindAt),
    assignedToName: task?.assignedToName ?? "",
    contactId: task?.contactId ?? "",
    organizationId: task?.organizationId ?? "",
    sourceType: task?.source?.type ?? "manual",
    sourceLabel: task?.source?.label ?? "",
  };
}

function mergeContacts(contacts: CRMContact[]) {
  return Array.from(new Map(contacts.map((contact) => [contact.id, contact])).values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function mergeOrganizations(organizations: CRMOrganization[]) {
  return Array.from(new Map(organizations.map((organization) => [organization.id, organization])).values()).sort((a, b) => a.name.localeCompare(b.name));
}

function toLocalDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatTaskDates(task: CaseTask) {
  const parts = [];
  if (task.dueAt) parts.push(`Fällig ${formatStoredDate(task.dueAt)}`);
  if (task.remindAt) parts.push(`Erinnerung ${formatStoredDate(task.remindAt)}`);
  if (task.completedAt) parts.push(`Erledigt ${formatStoredDate(task.completedAt)}`);
  return parts.join(" · ");
}

function statusLabel(status: CaseTaskStatus) {
  const labels: Record<CaseTaskStatus, string> = {
    open: "Offen",
    in_progress: "In Bearbeitung",
    done: "Erledigt",
    dismissed: "Verworfen",
    overdue: "Überfällig",
    archived: "Archiviert",
  };
  return labels[status];
}

function priorityLabel(priority: CaseTaskPriority) {
  const labels: Record<CaseTaskPriority, string> = {
    low: "Niedrig",
    normal: "Normal",
    high: "Hoch",
    urgent: "Dringend",
  };
  return labels[priority];
}

function typeLabel(type: CaseTaskType) {
  return taskTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function TaskActionButton({ children, onClick, disabled, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        danger
          ? "inline-flex h-9 items-center justify-center gap-1 rounded-md border border-red-400/25 px-3 text-xs font-bold text-red-200 transition hover:bg-red-500/10 disabled:border-slate-800 disabled:text-slate-600"
          : "inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600"
      }
    >
      {children}
    </button>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1.5 text-sm font-bold text-slate-300 ${className}`}>
      {label}
      {children}
    </label>
  );
}

const inputClass = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500";
