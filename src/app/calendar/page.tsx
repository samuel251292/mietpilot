"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Archive, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Edit3, Filter, MapPin, Plus, Search, X } from "lucide-react";
import { CaseService, CaseServiceAsync, formatStoredDate } from "@/lib/case-service";
import { canEditCase, visibleCases } from "@/lib/auth";
import { useAuth } from "@/lib/use-auth";
import {
  getCalendarCounts,
  getEventsForDate,
  getEventsForMonth,
  getEventsForWeek,
  listCalendarEvents,
  type CalendarEvent,
} from "@/lib/calendar/calendar-service";
import { generateCalendarSuggestions } from "@/lib/calendar/calendar-suggestions";
import { buildContactsFromCase, buildOrganizationsFromCase, findContactsByCase, findOrganizationsByCase } from "@/lib/crm/crm-service";
import { archiveTask, completeTask, createTask, updateTask } from "@/lib/tasks/task-service";
import type { AppointmentStatus, CaseTaskPriority, CaseTaskType, SavedCaseRecord } from "@/types/case";

type CalendarView = "agenda" | "week" | "month";
type CalendarEventType = Extract<CaseTaskType, "appointment" | "hearing" | "visit">;
type EventRow = CalendarEvent & { record: SavedCaseRecord };

type AppointmentFormValues = {
  caseId: string;
  title: string;
  type: CalendarEventType;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string;
  priority: CaseTaskPriority;
  assignedToName: string;
  contactId: string;
  organizationId: string;
  appointmentStatus: AppointmentStatus;
  court: string;
  caseNumber: string;
  room: string;
  judge: string;
  opponentLawyer: string;
  meetingPoint: string;
  contactPerson: string;
  accessNotes: string;
};

const typeOptions: Array<{ value: "all" | CalendarEventType; label: string }> = [
  { value: "all", label: "Alle Typen" },
  { value: "appointment", label: "Termin" },
  { value: "hearing", label: "Verhandlung" },
  { value: "visit", label: "Besichtigung" },
];

const statusOptions: Array<{ value: "all" | AppointmentStatus; label: string }> = [
  { value: "all", label: "Alle Status" },
  { value: "planned", label: "Geplant" },
  { value: "confirmed", label: "Bestätigt" },
  { value: "postponed", label: "Verschoben" },
  { value: "completed", label: "Abgehalten" },
  { value: "cancelled", label: "Abgesagt" },
];

const priorityOptions: Array<{ value: CaseTaskPriority; label: string }> = [
  { value: "low", label: "Niedrig" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Hoch" },
  { value: "urgent", label: "Dringend" },
];

const assignmentOptions = [
  { value: "all", label: "Alle Zuständigen" },
  { value: "mine", label: "Meine" },
  { value: "unassigned", label: "Nicht zugewiesen" },
] as const;

export default function CalendarPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);
  const [view, setView] = useState<CalendarView>("agenda");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | CalendarEventType>("all");
  const [status, setStatus] = useState<"all" | AppointmentStatus>("all");
  const [assignment, setAssignment] = useState<(typeof assignmentOptions)[number]["value"]>("all");
  const [onlyToday, setOnlyToday] = useState(false);
  const [onlyWeek, setOnlyWeek] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
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
        console.warn("Async-Kalenderfälle konnten nicht geladen werden. LocalStorage-Fallback wird genutzt.", error);
        const fallbackRecords = CaseService.list();
        if (!cancelled) {
          setRecords(fallbackRecords);
          setLoadError("Kalenderdaten konnten nicht aus dem vorbereiteten Online-Repository geladen werden. Lokale Daten werden angezeigt.");
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
  const eventRows = useMemo(() => collectEventRows(scopeRecords), [scopeRecords]);
  const filteredEvents = useMemo(
    () => filterEvents(eventRows, { query, type, status, assignment, onlyToday, onlyWeek, userId: user?.id, userName: user?.name }),
    [assignment, eventRows, onlyToday, onlyWeek, query, status, type, user?.id, user?.name],
  );
  const counts = useMemo(() => getCalendarCounts(filteredEvents, new Date()), [filteredEvents]);
  const suggestionCount = useMemo(() => scopeRecords.reduce((sum, record) => sum + generateCalendarSuggestions(record).length, 0), [scopeRecords]);
  const displayEvents = useMemo(() => {
    if (view === "week") return getEventsForWeek(filteredEvents, focusDate) as EventRow[];
    if (view === "month") return getEventsForMonth(filteredEvents, focusDate) as EventRow[];
    return filteredEvents;
  }, [filteredEvents, focusDate, view]);

  function refreshRecord(record: SavedCaseRecord) {
    setRecords((current) => current.map((item) => (item.id === record.id ? record : item)));
  }

  function saveRecord(record: SavedCaseRecord) {
    const saved = CaseService.save(record, { actor: user, skipAutoActivity: true });
    refreshRecord(saved);
  }

  function createAppointment(values: AppointmentFormValues) {
    const record = scopeRecords.find((item) => item.id === values.caseId);
    if (!record || !canEditCase(user, record)) return;
    const nextRecord = createTask(record, {
      title: values.title.trim(),
      type: values.type,
      priority: values.priority,
      startAt: fromLocalDateTime(values.startAt),
      endAt: fromLocalDateTime(values.endAt),
      dueAt: fromLocalDateTime(values.startAt),
      allDay: values.allDay,
      location: values.location.trim() || undefined,
      assignedToName: values.assignedToName.trim() || undefined,
      contactId: values.contactId || undefined,
      organizationId: values.organizationId || undefined,
      appointmentStatus: values.appointmentStatus,
      hearingDetails: values.type === "hearing" ? buildHearingDetails(values) : undefined,
      visitDetails: values.type === "visit" ? buildVisitDetails(values) : undefined,
      actor: user,
    });
    saveRecord(nextRecord);
    setCreateOpen(false);
  }

  function updateAppointment(row: EventRow, values: AppointmentFormValues) {
    const nextRecord = updateTask(row.record, row.taskId, {
      title: values.title.trim(),
      type: values.type,
      priority: values.priority,
      startAt: fromLocalDateTime(values.startAt),
      endAt: fromLocalDateTime(values.endAt),
      dueAt: fromLocalDateTime(values.startAt),
      allDay: values.allDay,
      location: values.location.trim() || undefined,
      assignedToName: values.assignedToName.trim() || undefined,
      contactId: values.contactId || undefined,
      organizationId: values.organizationId || undefined,
      appointmentStatus: values.appointmentStatus,
      hearingDetails: values.type === "hearing" ? buildHearingDetails(values) : undefined,
      visitDetails: values.type === "visit" ? buildVisitDetails(values) : undefined,
      actor: user,
    });
    saveRecord(nextRecord);
    setEditingEvent(null);
  }

  function completeEvent(row: EventRow) {
    if (!canEditCase(user, row.record)) return;
    const completed = completeTask(row.record, row.taskId, { actor: user });
    saveRecord(updateTask(completed, row.taskId, { appointmentStatus: "completed", actor: user }));
  }

  function cancelEvent(row: EventRow) {
    if (!canEditCase(user, row.record)) return;
    const updated = updateTask(row.record, row.taskId, { appointmentStatus: "cancelled", actor: user });
    saveRecord(archiveTask(updated, row.taskId, { actor: user, note: "Termin abgesagt/archiviert." }));
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-blue-300">MAWA Kalender</div>
            <h1 className="mt-1 text-2xl font-extrabold text-white">Kalender</h1>
            <p className="mt-1 text-sm text-slate-400">Termine, Verhandlungen und Besichtigungen aus sichtbaren Fällen.</p>
          </div>
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500">
            <Plus size={16} />
            Neuer Termin
          </button>
        </div>

        {loading && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
            Kalenderdaten werden geladen ...
          </div>
        )}
        {loadError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {loadError}
          </div>
        )}

        <section className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi title="Heute" value={counts.today} tone="blue" />
          <Kpi title="Diese Woche" value={counts.week} tone="violet" />
          <Kpi title="Verhandlungen" value={counts.hearings} tone="orange" />
          <Kpi title="Besichtigungen" value={counts.visits} tone="green" />
          <Kpi title="Kundentermine" value={counts.appointments} tone="blue" />
          <Kpi title="Überfällig" value={counts.overdue} tone="red" />
        </section>

        {suggestionCount > 0 && (
          <div className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">
            {suggestionCount === 1 ? "1 automatischer Terminvorschlag" : `${suggestionCount} automatische Terminvorschläge`} in sichtbaren Fällen vorhanden.
          </div>
        )}

        <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-white">
            <Filter size={16} />
            Filter
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suche nach Fall, Mieter, Adresse, Titel, Ort..." className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm font-semibold text-white outline-none focus:border-blue-500" />
            </label>
            <FilterSelect value={type} onChange={(value) => setType(value as "all" | CalendarEventType)} options={typeOptions} />
            <FilterSelect value={status} onChange={(value) => setStatus(value as "all" | AppointmentStatus)} options={statusOptions} />
            <FilterSelect value={assignment} onChange={(value) => setAssignment(value as (typeof assignmentOptions)[number]["value"])} options={assignmentOptions} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Toggle active={onlyToday} onClick={() => setOnlyToday((value) => !value)} label="Nur heute" />
            <Toggle active={onlyWeek} onClick={() => setOnlyWeek((value) => !value)} label="Nur diese Woche" />
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
            <ViewTabs view={view} onChange={setView} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setFocusDate(shiftDate(focusDate, view, -1))} className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => setFocusDate(new Date())} className="h-9 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800">Heute</button>
              <button type="button" onClick={() => setFocusDate(shiftDate(focusDate, view, 1))} className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"><ChevronRight size={16} /></button>
            </div>
          </div>
          {view === "agenda" && <AgendaView events={displayEvents} userCanEdit={(event) => canEditCase(user, event.record)} onEdit={setEditingEvent} onComplete={completeEvent} onCancel={cancelEvent} />}
          {view === "week" && <WeekView events={displayEvents} focusDate={focusDate} userCanEdit={(event) => canEditCase(user, event.record)} onEdit={setEditingEvent} onComplete={completeEvent} onCancel={cancelEvent} />}
          {view === "month" && <MonthView events={displayEvents} focusDate={focusDate} userCanEdit={(event) => canEditCase(user, event.record)} onEdit={setEditingEvent} onComplete={completeEvent} onCancel={cancelEvent} />}
        </section>

        {createOpen && <AppointmentModal records={scopeRecords.filter((record) => canEditCase(user, record))} onClose={() => setCreateOpen(false)} onSubmit={createAppointment} />}
        {editingEvent && <AppointmentModal records={[editingEvent.record]} event={editingEvent} onClose={() => setEditingEvent(null)} onSubmit={(values) => updateAppointment(editingEvent, values)} />}
      </div>
    </div>
  );
}

function AgendaView({ events, userCanEdit, onEdit, onComplete, onCancel }: EventViewProps) {
  if (events.length === 0) return <EmptyCalendarState />;
  return (
    <div className="divide-y divide-slate-800">
      {events.map((event) => (
        <EventRowCard key={event.id} event={event} canEdit={userCanEdit(event)} onEdit={() => onEdit(event)} onComplete={() => onComplete(event)} onCancel={() => onCancel(event)} />
      ))}
    </div>
  );
}

function WeekView({ events, focusDate, userCanEdit, onEdit, onComplete, onCancel }: EventViewProps & { focusDate: Date }) {
  const days = getWeekDays(focusDate);
  return (
    <div className="grid gap-3 p-4 lg:grid-cols-7">
      {days.map((day) => {
        const dayEvents = events.filter((event) => sameDay(event.startAt, day));
        return (
          <div key={day.toISOString()} className="min-h-[180px] rounded-lg border border-slate-800 bg-slate-950/35 p-3">
            <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{formatDayLabel(day)}</div>
            <div className="mt-3 grid gap-2">
              {dayEvents.length === 0 && <div className="text-xs font-semibold text-slate-600">Keine Termine</div>}
              {dayEvents.map((event) => <CompactEvent key={event.id} event={event} canEdit={userCanEdit(event)} onEdit={() => onEdit(event)} onComplete={() => onComplete(event)} onCancel={() => onCancel(event)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ events, focusDate, userCanEdit, onEdit, onComplete, onCancel }: EventViewProps & { focusDate: Date }) {
  const days = getMonthGrid(focusDate);
  return (
    <div className="p-4">
      <div className="mb-3 text-sm font-extrabold text-white">{focusDate.toLocaleDateString("de-AT", { month: "long", year: "numeric" })}</div>
      <div className="grid gap-2 md:grid-cols-7">
        {days.map((day) => {
          const dayEvents = events.filter((event) => sameDay(event.startAt, day));
          const inMonth = day.getMonth() === focusDate.getMonth();
          return (
            <div key={day.toISOString()} className={inMonth ? "min-h-[130px] rounded-lg border border-slate-800 bg-slate-950/35 p-3" : "min-h-[130px] rounded-lg border border-slate-900 bg-slate-950/15 p-3 opacity-55"}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-400">{day.getDate()}</span>
                {dayEvents.length > 0 && <span className="rounded-md bg-blue-500/15 px-2 py-0.5 text-xs font-extrabold text-blue-200">{dayEvents.length}</span>}
              </div>
              <div className="mt-2 grid gap-1.5">
                {dayEvents.slice(0, 2).map((event) => <CompactEvent key={event.id} event={event} canEdit={userCanEdit(event)} onEdit={() => onEdit(event)} onComplete={() => onComplete(event)} onCancel={() => onCancel(event)} minimal />)}
                {dayEvents.length > 2 && <div className="text-xs font-bold text-slate-500">+ {dayEvents.length - 2} weitere</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type EventViewProps = {
  events: EventRow[];
  userCanEdit: (event: EventRow) => boolean;
  onEdit: (event: EventRow) => void;
  onComplete: (event: EventRow) => void;
  onCancel: (event: EventRow) => void;
};

function EventRowCard({ event, canEdit, onEdit, onComplete, onCancel }: { event: EventRow; canEdit: boolean; onEdit: () => void; onComplete: () => void; onCancel: () => void }) {
  return (
    <article className="grid gap-4 p-4 lg:grid-cols-[150px_1fr_auto] lg:items-center">
      <div>
        <div className="text-sm font-extrabold text-white">{formatDate(event.startAt)}</div>
        <div className="mt-1 text-xs font-bold text-slate-500">{event.allDay ? "Ganztägig" : `${formatTime(event.startAt)} - ${formatTime(event.endAt)}`}</div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={event.type} />
          <StatusBadge status={event.appointmentStatus} />
          <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-300">{event.caseNumber}</span>
        </div>
        <div className="mt-2 text-base font-extrabold text-white">{event.title}</div>
        <div className="mt-1 text-sm font-semibold text-slate-400">{event.tenant || "Mieter fehlt"} · {event.address || "Adresse fehlt"}</div>
        {event.location && <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500"><MapPin size={13} />{event.location}</div>}
      </div>
      <EventActions event={event} canEdit={canEdit} onEdit={onEdit} onComplete={onComplete} onCancel={onCancel} />
    </article>
  );
}

function CompactEvent({ event, canEdit, onEdit, onComplete, onCancel, minimal }: { event: EventRow; canEdit: boolean; onEdit: () => void; onComplete: () => void; onCancel: () => void; minimal?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/80 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs font-extrabold text-white">{event.title}</div>
        <TypeDot type={event.type} />
      </div>
      {!minimal && <div className="mt-1 text-xs font-semibold text-slate-500">{event.allDay ? "Ganztägig" : formatTime(event.startAt)} · {event.caseNumber}</div>}
      {!minimal && <EventActions event={event} canEdit={canEdit} onEdit={onEdit} onComplete={onComplete} onCancel={onCancel} compact />}
    </div>
  );
}

function EventActions({ event, canEdit, onEdit, onComplete, onCancel, compact }: { event: EventRow; canEdit: boolean; onEdit: () => void; onComplete: () => void; onCancel: () => void; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "mt-2" : "justify-start lg:justify-end"}`}>
      <Link href={`/cases/${event.caseId}`} className="inline-flex h-8 items-center rounded-md border border-slate-700 px-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800">Zum Fall</Link>
      <IconButton disabled={!canEdit} onClick={onEdit} title="Bearbeiten"><Edit3 size={14} /></IconButton>
      <IconButton disabled={!canEdit || event.status === "done"} onClick={onComplete} title="Abgehalten"><CheckCircle2 size={14} /></IconButton>
      <IconButton disabled={!canEdit || event.status === "archived"} onClick={onCancel} title="Absagen/Archivieren" danger><Archive size={14} /></IconButton>
    </div>
  );
}

function AppointmentModal({ records, event, onSubmit, onClose }: { records: SavedCaseRecord[]; event?: EventRow; onSubmit: (values: AppointmentFormValues) => void; onClose: () => void }) {
  const [values, setValues] = useState<AppointmentFormValues>(() => eventToFormValues(event, records[0]?.id ?? ""));
  const selectedType = values.type;
  const selectedRecord = records.find((record) => record.id === values.caseId) ?? records[0];
  const contacts = selectedRecord ? mergeContacts([...findContactsByCase(selectedRecord.id), ...buildContactsFromCase(selectedRecord)]) : [];
  const organizations = selectedRecord ? mergeOrganizations([...findOrganizationsByCase(selectedRecord.id), ...buildOrganizationsFromCase(selectedRecord)]) : [];

  function update<K extends keyof AppointmentFormValues>(key: K, value: AppointmentFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-slate-950/60">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-white">{event ? "Termin bearbeiten" : "Neuer Termin"}</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800" aria-label="Schließen"><X size={16} /></button>
        </div>

        {records.length === 0 ? (
          <div className="mt-5 rounded-md border border-amber-400/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">Keine bearbeitbaren Fälle verfügbar.</div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Fall" className="md:col-span-2">
              <select disabled={Boolean(event)} value={values.caseId} onChange={(change) => update("caseId", change.target.value)} className={inputClass}>
                {records.map((record) => <option key={record.id} value={record.id}>{record.id} · {record.tenant || "Mieter fehlt"} · {record.address || "Adresse fehlt"}</option>)}
              </select>
            </Field>
            <Field label="Titel" className="md:col-span-2"><input value={values.title} onChange={(change) => update("title", change.target.value)} className={inputClass} /></Field>
            <Field label="Typ">
              <select value={values.type} onChange={(change) => update("type", change.target.value as CalendarEventType)} className={inputClass}>
                {typeOptions.filter((option) => option.value !== "all").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={values.appointmentStatus} onChange={(change) => update("appointmentStatus", change.target.value as AppointmentStatus)} className={inputClass}>
                {statusOptions.filter((option) => option.value !== "all").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Start"><input type="datetime-local" value={values.startAt} onChange={(change) => update("startAt", change.target.value)} className={inputClass} /></Field>
            <Field label="Ende"><input type="datetime-local" value={values.endAt} onChange={(change) => update("endAt", change.target.value)} className={inputClass} /></Field>
            <label className="flex h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-bold text-slate-300">
              <input type="checkbox" checked={values.allDay} onChange={(change) => update("allDay", change.target.checked)} />
              Ganztägig
            </label>
            <Field label="Priorität">
              <select value={values.priority} onChange={(change) => update("priority", change.target.value as CaseTaskPriority)} className={inputClass}>
                {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Ort" className="md:col-span-2"><input value={values.location} onChange={(change) => update("location", change.target.value)} className={inputClass} /></Field>
            <Field label="Zuständig" className="md:col-span-2"><input value={values.assignedToName} onChange={(change) => update("assignedToName", change.target.value)} className={inputClass} /></Field>
            <Field label="CRM-Kontakt"><select value={values.contactId} onChange={(change) => update("contactId", change.target.value)} className={inputClass}><option value="">Kein Kontakt</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select></Field>
            <Field label="CRM-Organisation"><select value={values.organizationId} onChange={(change) => update("organizationId", change.target.value)} className={inputClass}><option value="">Keine Organisation</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></Field>

            {selectedType === "hearing" && (
              <div className="grid gap-4 rounded-lg border border-slate-800 bg-slate-950/35 p-4 md:col-span-2 md:grid-cols-2">
                <Field label="Gericht"><input value={values.court} onChange={(change) => update("court", change.target.value)} className={inputClass} /></Field>
                <Field label="Aktenzeichen"><input value={values.caseNumber} onChange={(change) => update("caseNumber", change.target.value)} className={inputClass} /></Field>
                <Field label="Saal"><input value={values.room} onChange={(change) => update("room", change.target.value)} className={inputClass} /></Field>
                <Field label="Richter"><input value={values.judge} onChange={(change) => update("judge", change.target.value)} className={inputClass} /></Field>
                <Field label="Gegner-Anwalt" className="md:col-span-2"><input value={values.opponentLawyer} onChange={(change) => update("opponentLawyer", change.target.value)} className={inputClass} /></Field>
              </div>
            )}

            {selectedType === "visit" && (
              <div className="grid gap-4 rounded-lg border border-slate-800 bg-slate-950/35 p-4 md:col-span-2 md:grid-cols-2">
                <Field label="Treffpunkt"><input value={values.meetingPoint} onChange={(change) => update("meetingPoint", change.target.value)} className={inputClass} /></Field>
                <Field label="Kontaktperson"><input value={values.contactPerson} onChange={(change) => update("contactPerson", change.target.value)} className={inputClass} /></Field>
                <Field label="Zugangshinweise" className="md:col-span-2"><textarea value={values.accessNotes} onChange={(change) => update("accessNotes", change.target.value)} rows={3} className={inputClass} /></Field>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">Abbrechen</button>
          <button type="button" disabled={!values.caseId || !values.title.trim() || !values.startAt} onClick={() => onSubmit(values)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500">Speichern</button>
        </div>
      </div>
    </div>
  );
}

function collectEventRows(records: SavedCaseRecord[]): EventRow[] {
  return listCalendarEvents(records).map((event) => {
    const record = records.find((item) => item.id === event.caseId);
    return record ? { ...event, record } : null;
  }).filter((event): event is EventRow => Boolean(event));
}

function filterEvents(
  events: EventRow[],
  filters: {
    query: string;
    type: "all" | CalendarEventType;
    status: "all" | AppointmentStatus;
    assignment: "all" | "mine" | "unassigned";
    onlyToday: boolean;
    onlyWeek: boolean;
    userId?: string;
    userName?: string;
  },
) {
  const normalizedQuery = filters.query.trim().toLowerCase();
  return events.filter((event) => {
    if (normalizedQuery && ![event.caseNumber, event.tenant, event.address, event.title, event.location].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery))) return false;
    if (filters.type !== "all" && event.type !== filters.type) return false;
    if (filters.status !== "all" && event.appointmentStatus !== filters.status) return false;
    if (filters.assignment === "mine" && event.sourceTask.assignedTo !== filters.userId && event.sourceTask.assignedToName !== filters.userName) return false;
    if (filters.assignment === "unassigned" && (event.sourceTask.assignedTo || event.sourceTask.assignedToName)) return false;
    if (filters.onlyToday && !sameDay(event.startAt, new Date())) return false;
    if (filters.onlyWeek && !isInWeek(event.startAt, new Date())) return false;
    return true;
  });
}

function eventToFormValues(event: EventRow | undefined, fallbackCaseId: string): AppointmentFormValues {
  const source = event?.sourceTask;
  return {
    caseId: event?.caseId ?? fallbackCaseId,
    title: event?.title ?? "",
    type: event?.type ?? "appointment",
    startAt: toLocalDateTime(event?.startAt),
    endAt: toLocalDateTime(event?.endAt),
    allDay: Boolean(event?.allDay),
    location: event?.location ?? "",
    priority: event?.priority ?? "normal",
    assignedToName: event?.assignedTo ?? "",
    contactId: source?.contactId ?? "",
    organizationId: source?.organizationId ?? "",
    appointmentStatus: event?.appointmentStatus ?? "planned",
    court: source?.hearingDetails?.court ?? "",
    caseNumber: source?.hearingDetails?.caseNumber ?? "",
    room: source?.hearingDetails?.room ?? "",
    judge: source?.hearingDetails?.judge ?? "",
    opponentLawyer: source?.hearingDetails?.opponentLawyer ?? "",
    meetingPoint: source?.visitDetails?.meetingPoint ?? "",
    contactPerson: source?.visitDetails?.contactPerson ?? "",
    accessNotes: source?.visitDetails?.accessNotes ?? "",
  };
}

function mergeContacts(contacts: Array<{ id: string; displayName: string }>) {
  return Array.from(new Map(contacts.map((contact) => [contact.id, contact])).values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function mergeOrganizations(organizations: Array<{ id: string; name: string }>) {
  return Array.from(new Map(organizations.map((organization) => [organization.id, organization])).values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildHearingDetails(values: AppointmentFormValues) {
  return {
    court: optional(values.court),
    caseNumber: optional(values.caseNumber),
    room: optional(values.room),
    judge: optional(values.judge),
    opponentLawyer: optional(values.opponentLawyer),
  };
}

function buildVisitDetails(values: AppointmentFormValues) {
  return {
    meetingPoint: optional(values.meetingPoint),
    contactPerson: optional(values.contactPerson),
    accessNotes: optional(values.accessNotes),
  };
}

function optional(value: string) {
  return value.trim() || undefined;
}

function ViewTabs({ view, onChange }: { view: CalendarView; onChange: (view: CalendarView) => void }) {
  const tabs: Array<{ value: CalendarView; label: string }> = [
    { value: "agenda", label: "Agenda" },
    { value: "week", label: "Woche" },
    { value: "month", label: "Monat" },
  ];
  return (
    <div className="flex gap-2">
      {tabs.map((tab) => (
        <button key={tab.value} type="button" onClick={() => onChange(tab.value)} className={view === tab.value ? "rounded-md bg-blue-600 px-3 py-2 text-sm font-bold text-white" : "rounded-md border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800"}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ title, value, tone }: { title: string; value: number; tone: "blue" | "red" | "orange" | "violet" | "green" }) {
  const className = {
    blue: "text-blue-200",
    red: "text-red-200",
    orange: "text-orange-200",
    violet: "text-violet-200",
    green: "text-emerald-200",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`mt-4 text-3xl font-extrabold ${className}`}>{value}</div>
    </div>
  );
}

function TypeBadge({ type }: { type: CalendarEventType }) {
  const className = type === "hearing" ? "bg-orange-500/15 text-orange-200" : type === "visit" ? "bg-emerald-500/15 text-emerald-200" : "bg-blue-500/15 text-blue-200";
  return <span className={`rounded-md px-2 py-1 text-xs font-extrabold ${className}`}>{typeLabel(type)}</span>;
}

function TypeDot({ type }: { type: CalendarEventType }) {
  const className = type === "hearing" ? "bg-orange-300" : type === "visit" ? "bg-emerald-300" : "bg-blue-300";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

function StatusBadge({ status }: { status?: AppointmentStatus }) {
  const className = status === "confirmed" ? "bg-emerald-500/15 text-emerald-200" : status === "cancelled" ? "bg-red-500/15 text-red-200" : status === "postponed" ? "bg-amber-500/15 text-amber-200" : status === "completed" ? "bg-slate-700 text-slate-200" : "bg-blue-500/15 text-blue-200";
  return <span className={`rounded-md px-2 py-1 text-xs font-extrabold ${className}`}>{statusLabel(status)}</span>;
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
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className={danger ? "grid h-8 w-8 place-items-center rounded-md border border-red-400/25 text-red-200 hover:bg-red-500/10 disabled:border-slate-800 disabled:text-slate-600" : "grid h-8 w-8 place-items-center rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600"}>{children}</button>;
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`grid gap-1.5 text-sm font-bold text-slate-300 ${className}`}>{label}{children}</label>;
}

function EmptyCalendarState() {
  return (
    <div className="p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-blue-500/10 text-blue-300"><CalendarDays size={22} /></div>
      <h2 className="mt-4 text-lg font-extrabold text-white">Keine Termine gefunden</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">Erstellen Sie einen Termin, eine Verhandlung oder eine Besichtigung zu einem sichtbaren Fall.</p>
    </div>
  );
}

function shiftDate(date: Date, view: CalendarView, direction: number) {
  const next = new Date(date);
  if (view === "month") next.setMonth(next.getMonth() + direction);
  else next.setDate(next.getDate() + (view === "week" ? 7 : 1) * direction);
  return next;
}

function getWeekDays(date: Date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function getMonthGrid(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function isInWeek(value: string, reference: Date) {
  const date = new Date(value);
  const start = startOfWeek(reference);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime();
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

function sameDay(value: Date | string, reference: Date | string) {
  const a = value instanceof Date ? value : new Date(value);
  const b = reference instanceof Date ? reference : new Date(reference);
  return !Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && a.toDateString() === b.toDateString();
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatDayLabel(value: Date) {
  return new Intl.DateTimeFormat("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" }).format(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function typeLabel(type: CalendarEventType) {
  if (type === "hearing") return "Verhandlung";
  if (type === "visit") return "Besichtigung";
  return "Termin";
}

function statusLabel(status?: AppointmentStatus) {
  if (status === "confirmed") return "Bestätigt";
  if (status === "postponed") return "Verschoben";
  if (status === "completed") return "Abgehalten";
  if (status === "cancelled") return "Abgesagt";
  return "Geplant";
}

const inputClass = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-blue-500 disabled:text-slate-500";
