"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Archive, CalendarDays, CheckCircle2, Clock, Edit3, Gavel, Home, MapPin, Plus, X } from "lucide-react";
import { CaseService, formatStoredDate } from "@/lib/case-service";
import { canEditCase, type PublicUser } from "@/lib/auth";
import { listCalendarEventsForCase, type CalendarEvent } from "@/lib/calendar/calendar-service";
import { applyAllCalendarSuggestions, applyCalendarSuggestion, generateCalendarSuggestions } from "@/lib/calendar/calendar-suggestions";
import { buildContactsFromCase, buildOrganizationsFromCase, findContactsByCase, findOrganizationsByCase } from "@/lib/crm/crm-service";
import { archiveTask, completeTask, createTask, updateTask } from "@/lib/tasks/task-service";
import type { AppointmentStatus, CalendarSuggestion, CaseTaskPriority, CaseTaskType, SavedCaseRecord } from "@/types/case";
import type { CRMContact, CRMOrganization } from "@/types/crm";

type CalendarEventType = Extract<CaseTaskType, "appointment" | "hearing" | "visit">;

type AppointmentFormValues = {
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

const typeOptions: Array<{ value: CalendarEventType; label: string }> = [
  { value: "appointment", label: "Termin" },
  { value: "hearing", label: "Verhandlung" },
  { value: "visit", label: "Besichtigung" },
];

const statusOptions: Array<{ value: AppointmentStatus; label: string }> = [
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

export function CaseCalendarPanel({ record, user, onRecordChange }: { record: SavedCaseRecord; user: PublicUser | null; onRecordChange: (record: SavedCaseRecord) => void }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const canEdit = canEditCase(user, record);
  const events = useMemo(() => listCalendarEventsForCase(record), [record]);
  const grouped = useMemo(() => groupCaseEvents(events), [events]);
  const suggestions = useMemo(() => generateCalendarSuggestions(record), [record]);
  const crmContacts = useMemo(() => mergeContacts([...findContactsByCase(record.id), ...buildContactsFromCase(record)]), [record]);
  const crmOrganizations = useMemo(() => mergeOrganizations([...findOrganizationsByCase(record.id), ...buildOrganizationsFromCase(record)]), [record]);

  function saveRecord(nextRecord: SavedCaseRecord) {
    const saved = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    onRecordChange(saved);
  }

  function createAppointment(values: AppointmentFormValues) {
    saveRecord(createTask(record, {
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
    }));
    setFormOpen(false);
  }

  function updateAppointment(event: CalendarEvent, values: AppointmentFormValues) {
    saveRecord(updateTask(record, event.taskId, {
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
    }));
    setEditingEvent(null);
  }

  function completeEvent(event: CalendarEvent) {
    const completed = completeTask(record, event.taskId, { actor: user });
    saveRecord(updateTask(completed, event.taskId, { appointmentStatus: "completed", actor: user }));
  }

  function postponeEvent(event: CalendarEvent) {
    saveRecord(updateTask(record, event.taskId, { appointmentStatus: "postponed", actor: user }));
  }

  function cancelEvent(event: CalendarEvent) {
    const updated = updateTask(record, event.taskId, { appointmentStatus: "cancelled", actor: user });
    saveRecord(archiveTask(updated, event.taskId, { actor: user, note: "Termin abgesagt/archiviert." }));
  }

  function applySuggestion(suggestion: CalendarSuggestion) {
    saveRecord(applyCalendarSuggestion(record, suggestion));
  }

  function applyAllSuggestions() {
    saveRecord(applyAllCalendarSuggestions(record));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-white">Termine</h2>
          <p className="mt-1 text-sm text-slate-400">Kundentermine, Verhandlungen und Besichtigungen zu diesem Fall.</p>
        </div>
        <button type="button" disabled={!canEdit} onClick={() => setFormOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500">
          <Plus size={16} />
          Neuer Termin
        </button>
      </div>

      <CalendarSuggestionsPanel suggestions={suggestions} canEdit={canEdit} onApply={applySuggestion} onApplyAll={applyAllSuggestions} />

      {events.length === 0 && <AppointmentEmptyState canEdit={canEdit} onCreate={() => setFormOpen(true)} />}
      {grouped.upcoming.length > 0 && <EventSection title="Kommende Termine" events={grouped.upcoming} canEdit={canEdit} onEdit={setEditingEvent} onComplete={completeEvent} onPostpone={postponeEvent} onCancel={cancelEvent} />}
      {grouped.hearings.length > 0 && <EventSection title="Verhandlungen" events={grouped.hearings} canEdit={canEdit} onEdit={setEditingEvent} onComplete={completeEvent} onPostpone={postponeEvent} onCancel={cancelEvent} />}
      {grouped.visits.length > 0 && <EventSection title="Besichtigungen" events={grouped.visits} canEdit={canEdit} onEdit={setEditingEvent} onComplete={completeEvent} onPostpone={postponeEvent} onCancel={cancelEvent} />}
      {grouped.appointments.length > 0 && <EventSection title="Kundentermine" events={grouped.appointments} canEdit={canEdit} onEdit={setEditingEvent} onComplete={completeEvent} onPostpone={postponeEvent} onCancel={cancelEvent} />}
      {grouped.past.length > 0 && <EventSection title="Vergangene Termine" events={grouped.past} canEdit={canEdit} onEdit={setEditingEvent} onComplete={completeEvent} onPostpone={postponeEvent} onCancel={cancelEvent} muted />}

      {formOpen && <AppointmentModal record={record} contacts={crmContacts} organizations={crmOrganizations} onClose={() => setFormOpen(false)} onSubmit={createAppointment} />}
      {editingEvent && <AppointmentModal record={record} contacts={crmContacts} organizations={crmOrganizations} event={editingEvent} onClose={() => setEditingEvent(null)} onSubmit={(values) => updateAppointment(editingEvent, values)} />}
    </div>
  );
}

function CalendarSuggestionsPanel({ suggestions, canEdit, onApply, onApplyAll }: { suggestions: CalendarSuggestion[]; canEdit: boolean; onApply: (suggestion: CalendarSuggestion) => void; onApplyAll: () => void }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-white">Automatische Terminvorschläge</h3>
          <p className="mt-1 text-sm text-slate-400">{suggestions.length > 0 ? "Aus Schreiben, Kommunikation, Dokumenten und Falldaten erkannt." : "Keine automatischen Terminvorschläge vorhanden."}</p>
        </div>
        {suggestions.length > 0 && (
          <button type="button" disabled={!canEdit} onClick={onApplyAll} className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500">Alle übernehmen</button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="mt-4 grid gap-3">
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className="rounded-lg border border-slate-800 bg-slate-950/35 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-blue-500/15 px-2 py-1 text-xs font-extrabold text-blue-200">{suggestionTypeLabel(suggestion.type)}</span>
                    <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-300">{suggestion.source.label ?? suggestion.source.type}</span>
                    {(suggestion.startAt || suggestion.dueAt) && <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-300">{formatStoredDate(suggestion.startAt ?? suggestion.dueAt ?? "")}</span>}
                  </div>
                  <div className="mt-3 font-extrabold text-white">{suggestion.title}</div>
                  {suggestion.description && <div className="mt-1 text-sm font-semibold text-slate-400">{suggestion.description}</div>}
                  <div className="mt-2 text-xs font-semibold text-amber-200">Grund: {suggestion.reason}</div>
                </div>
                <button type="button" disabled={!canEdit} onClick={() => onApply(suggestion)} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600">Übernehmen</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EventSection({ title, events, canEdit, onEdit, onComplete, onPostpone, onCancel, muted }: { title: string; events: CalendarEvent[]; canEdit: boolean; onEdit: (event: CalendarEvent) => void; onComplete: (event: CalendarEvent) => void; onPostpone: (event: CalendarEvent) => void; onCancel: (event: CalendarEvent) => void; muted?: boolean }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className={muted ? "text-sm font-extrabold text-slate-400" : "text-sm font-extrabold text-white"}>{title}</h3>
        <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-300">{events.length}</span>
      </div>
      <div className="grid gap-3">
        {events.map((event) => (
          <EventCard key={event.id} event={event} canEdit={canEdit} onEdit={() => onEdit(event)} onComplete={() => onComplete(event)} onPostpone={() => onPostpone(event)} onCancel={() => onCancel(event)} />
        ))}
      </div>
    </section>
  );
}

function EventCard({ event, canEdit, onEdit, onComplete, onPostpone, onCancel }: { event: CalendarEvent; canEdit: boolean; onEdit: () => void; onComplete: () => void; onPostpone: () => void; onCancel: () => void }) {
  const details = event.sourceTask;
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={event.type} />
            <StatusBadge status={event.appointmentStatus} />
            <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-300">{priorityLabel(event.priority)}</span>
          </div>
          <h3 className="mt-3 text-base font-extrabold text-white">{event.title}</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
            <span className="rounded-md bg-slate-900 px-2 py-1">{event.allDay ? "Ganztägig" : `${formatStoredDate(event.startAt)} - ${timeOnly(event.endAt)}`}</span>
            {event.location && <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1"><MapPin size={13} />{event.location}</span>}
            {event.assignedTo && <span className="rounded-md bg-slate-900 px-2 py-1">Zuständig: {event.assignedTo}</span>}
          </div>
          {event.type === "hearing" && <DetailGrid entries={[
            ["Gericht", details.hearingDetails?.court],
            ["Aktenzeichen", details.hearingDetails?.caseNumber],
            ["Saal", details.hearingDetails?.room],
            ["Richter", details.hearingDetails?.judge],
            ["Gegner-Anwalt", details.hearingDetails?.opponentLawyer],
          ]} />}
          {event.type === "visit" && <DetailGrid entries={[
            ["Treffpunkt", details.visitDetails?.meetingPoint],
            ["Kontaktperson", details.visitDetails?.contactPerson],
            ["Zugangshinweise", details.visitDetails?.accessNotes],
          ]} />}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton disabled={!canEdit} onClick={onEdit}><Edit3 size={14} />Bearbeiten</ActionButton>
          <ActionButton disabled={!canEdit || event.status === "done"} onClick={onComplete}><CheckCircle2 size={14} />Abgehalten</ActionButton>
          <ActionButton disabled={!canEdit || event.appointmentStatus === "postponed"} onClick={onPostpone}><Clock size={14} />Verschoben</ActionButton>
          <ActionButton disabled={!canEdit || event.status === "archived"} onClick={onCancel} danger><Archive size={14} />Absagen</ActionButton>
        </div>
      </div>
    </article>
  );
}

function DetailGrid({ entries }: { entries: Array<[string, string | undefined]> }) {
  const visible = entries.filter(([, value]) => value);
  if (visible.length === 0) return null;
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {visible.map(([label, value]) => (
        <div key={label} className="rounded-md border border-slate-800 bg-slate-900/70 p-2">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-sm font-bold text-slate-200">{value}</div>
        </div>
      ))}
    </div>
  );
}

function AppointmentModal({ record, event, contacts, organizations, onSubmit, onClose }: { record: SavedCaseRecord; event?: CalendarEvent; contacts: CRMContact[]; organizations: CRMOrganization[]; onSubmit: (values: AppointmentFormValues) => void; onClose: () => void }) {
  const [values, setValues] = useState<AppointmentFormValues>(() => eventToFormValues(event, record));

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

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-slate-800 bg-slate-950/35 px-3 py-2 text-sm font-bold text-slate-300 md:col-span-2">{record.id} · {record.tenant || "Mieter fehlt"}</div>
          <Field label="Titel" className="md:col-span-2"><input value={values.title} onChange={(change) => update("title", change.target.value)} className={inputClass} /></Field>
          <Field label="Typ"><select value={values.type} onChange={(change) => update("type", change.target.value as CalendarEventType)} className={inputClass}>{typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
          <Field label="Status"><select value={values.appointmentStatus} onChange={(change) => update("appointmentStatus", change.target.value as AppointmentStatus)} className={inputClass}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
          <Field label="Start"><input type="datetime-local" value={values.startAt} onChange={(change) => update("startAt", change.target.value)} className={inputClass} /></Field>
          <Field label="Ende"><input type="datetime-local" value={values.endAt} onChange={(change) => update("endAt", change.target.value)} className={inputClass} /></Field>
          <label className="flex h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-bold text-slate-300"><input type="checkbox" checked={values.allDay} onChange={(change) => update("allDay", change.target.checked)} />Ganztägig</label>
          <Field label="Priorität"><select value={values.priority} onChange={(change) => update("priority", change.target.value as CaseTaskPriority)} className={inputClass}>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
          <Field label="Ort" className="md:col-span-2"><input value={values.location} onChange={(change) => update("location", change.target.value)} className={inputClass} /></Field>
          <Field label="Zuständig" className="md:col-span-2"><input value={values.assignedToName} onChange={(change) => update("assignedToName", change.target.value)} className={inputClass} /></Field>
          <Field label="CRM-Kontakt"><select value={values.contactId} onChange={(change) => update("contactId", change.target.value)} className={inputClass}><option value="">Kein Kontakt</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select></Field>
          <Field label="CRM-Organisation"><select value={values.organizationId} onChange={(change) => update("organizationId", change.target.value)} className={inputClass}><option value="">Keine Organisation</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></Field>
          {values.type === "hearing" && <DetailsBox><Field label="Gericht"><input value={values.court} onChange={(change) => update("court", change.target.value)} className={inputClass} /></Field><Field label="Aktenzeichen"><input value={values.caseNumber} onChange={(change) => update("caseNumber", change.target.value)} className={inputClass} /></Field><Field label="Saal"><input value={values.room} onChange={(change) => update("room", change.target.value)} className={inputClass} /></Field><Field label="Richter"><input value={values.judge} onChange={(change) => update("judge", change.target.value)} className={inputClass} /></Field><Field label="Gegner-Anwalt" className="md:col-span-2"><input value={values.opponentLawyer} onChange={(change) => update("opponentLawyer", change.target.value)} className={inputClass} /></Field></DetailsBox>}
          {values.type === "visit" && <DetailsBox><Field label="Treffpunkt"><input value={values.meetingPoint} onChange={(change) => update("meetingPoint", change.target.value)} className={inputClass} /></Field><Field label="Kontaktperson"><input value={values.contactPerson} onChange={(change) => update("contactPerson", change.target.value)} className={inputClass} /></Field><Field label="Zugangshinweise" className="md:col-span-2"><textarea value={values.accessNotes} onChange={(change) => update("accessNotes", change.target.value)} rows={3} className={inputClass} /></Field></DetailsBox>}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">Abbrechen</button>
          <button type="button" disabled={!values.title.trim() || !values.startAt} onClick={() => onSubmit(values)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500">Speichern</button>
        </div>
      </div>
    </div>
  );
}

function groupCaseEvents(events: CalendarEvent[]) {
  const today = startOfDay(new Date()).getTime();
  const isActive = (event: CalendarEvent) => event.status !== "done" && event.status !== "archived" && event.status !== "dismissed" && event.appointmentStatus !== "cancelled" && event.appointmentStatus !== "completed";
  return {
    upcoming: events.filter((event) => new Date(event.startAt).getTime() >= today && isActive(event)),
    past: events.filter((event) => new Date(event.startAt).getTime() < today || event.status === "done" || event.status === "archived"),
    hearings: events.filter((event) => event.type === "hearing"),
    visits: events.filter((event) => event.type === "visit"),
    appointments: events.filter((event) => event.type === "appointment"),
  };
}

function eventToFormValues(event: CalendarEvent | undefined, record: SavedCaseRecord): AppointmentFormValues {
  const task = event?.sourceTask;
  const startAt = event?.startAt ? toLocalDateTime(event.startAt) : "";
  return {
    title: event?.title ?? "",
    type: event?.type ?? "appointment",
    startAt,
    endAt: toLocalDateTime(event?.endAt) || defaultEnd(startAt),
    allDay: Boolean(event?.allDay),
    location: event?.location ?? "",
    priority: event?.priority ?? "normal",
    assignedToName: event?.assignedTo ?? record.ownerName ?? "",
    contactId: task?.contactId ?? "",
    organizationId: task?.organizationId ?? "",
    appointmentStatus: event?.appointmentStatus ?? "planned",
    court: task?.hearingDetails?.court ?? "",
    caseNumber: task?.hearingDetails?.caseNumber ?? "",
    room: task?.hearingDetails?.room ?? "",
    judge: task?.hearingDetails?.judge ?? "",
    opponentLawyer: task?.hearingDetails?.opponentLawyer ?? "",
    meetingPoint: task?.visitDetails?.meetingPoint ?? "",
    contactPerson: task?.visitDetails?.contactPerson ?? "",
    accessNotes: task?.visitDetails?.accessNotes ?? "",
  };
}

function mergeContacts(contacts: CRMContact[]) {
  return Array.from(new Map(contacts.map((contact) => [contact.id, contact])).values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function mergeOrganizations(organizations: CRMOrganization[]) {
  return Array.from(new Map(organizations.map((organization) => [organization.id, organization])).values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildHearingDetails(values: AppointmentFormValues) {
  return { court: optional(values.court), caseNumber: optional(values.caseNumber), room: optional(values.room), judge: optional(values.judge), opponentLawyer: optional(values.opponentLawyer) };
}

function buildVisitDetails(values: AppointmentFormValues) {
  return { meetingPoint: optional(values.meetingPoint), contactPerson: optional(values.contactPerson), accessNotes: optional(values.accessNotes) };
}

function AppointmentEmptyState({ canEdit, onCreate }: { canEdit: boolean; onCreate: () => void }) {
  return <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/55 p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-blue-500/10 text-blue-300"><CalendarDays size={22} /></div><h3 className="mt-4 text-base font-extrabold text-white">Noch keine Termine vorhanden</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">Erstellen Sie Termine, Verhandlungen oder Besichtigungen direkt zu diesem Fall.</p>{canEdit && <button type="button" onClick={onCreate} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500"><Plus size={16} />Termin erstellen</button>}</div>;
}

function TypeBadge({ type }: { type: CalendarEventType }) {
  const Icon = type === "hearing" ? Gavel : type === "visit" ? Home : CalendarDays;
  const label = type === "hearing" ? "Verhandlung" : type === "visit" ? "Besichtigung" : "Termin";
  return <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 px-2 py-1 text-xs font-extrabold text-blue-200"><Icon size={12} />{label}</span>;
}

function StatusBadge({ status }: { status?: AppointmentStatus }) {
  const label = status === "confirmed" ? "Bestätigt" : status === "postponed" ? "Verschoben" : status === "completed" ? "Abgehalten" : status === "cancelled" ? "Abgesagt" : "Geplant";
  return <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-200">{label}</span>;
}

function ActionButton({ children, onClick, disabled, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={danger ? "inline-flex h-9 items-center justify-center gap-1 rounded-md border border-red-400/25 px-3 text-xs font-bold text-red-200 transition hover:bg-red-500/10 disabled:border-slate-800 disabled:text-slate-600" : "inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600"}>{children}</button>;
}

function DetailsBox({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 rounded-lg border border-slate-800 bg-slate-950/35 p-4 md:col-span-2 md:grid-cols-2">{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`grid gap-1.5 text-sm font-bold text-slate-300 ${className}`}>{label}{children}</label>;
}

function fromLocalDateTime(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toLocalDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function defaultEnd(start: string) {
  if (!start) return "";
  const date = new Date(start);
  date.setHours(date.getHours() + 1);
  return toLocalDateTime(date.toISOString());
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function timeOnly(value: string) {
  return new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function priorityLabel(priority: CaseTaskPriority) {
  if (priority === "urgent") return "Dringend";
  if (priority === "high") return "Hoch";
  if (priority === "low") return "Niedrig";
  return "Normal";
}

function suggestionTypeLabel(type: CalendarSuggestion["type"]) {
  if (type === "hearing") return "Verhandlung";
  if (type === "visit") return "Besichtigung";
  if (type === "deadline") return "Frist";
  if (type === "follow_up") return "Follow-up";
  return "Termin";
}

function optional(value: string) {
  return value.trim() || undefined;
}

const inputClass = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-blue-500 disabled:text-slate-500";
