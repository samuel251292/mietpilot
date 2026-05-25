import type { AppointmentStatus, CaseTask, CaseTaskPriority, CaseTaskStatus, CaseTaskType, SavedCaseRecord } from "@/types/case";

export type CalendarEvent = {
  id: string;
  caseId: string;
  taskId: string;
  title: string;
  type: Extract<CaseTaskType, "appointment" | "hearing" | "visit">;
  status: CaseTaskStatus;
  appointmentStatus?: AppointmentStatus;
  priority: CaseTaskPriority;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  location?: string;
  caseNumber: string;
  tenant: string;
  address: string;
  assignedTo?: string;
  contactId?: string;
  organizationId?: string;
  sourceTask: CaseTask;
  metadata?: Record<string, unknown>;
};

const calendarTaskTypes = new Set<CaseTaskType>(["appointment", "hearing", "visit"]);

export function isCalendarTask(task: Pick<CaseTask, "type" | "startAt" | "dueAt">) {
  return calendarTaskTypes.has(task.type) && Boolean(getTaskStart(task));
}

export function getTaskStart(task: Pick<CaseTask, "startAt" | "dueAt">) {
  return normalizeDate(task.startAt) ?? normalizeDate(task.dueAt);
}

export function getTaskEnd(task: Pick<CaseTask, "endAt" | "startAt" | "dueAt" | "type">) {
  const explicitEnd = normalizeDate(task.endAt);
  if (explicitEnd) return explicitEnd;

  const start = getTaskStart(task);
  if (!start) return undefined;

  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return end.toISOString();
}

export function listCalendarEvents(records: SavedCaseRecord[]) {
  return records.flatMap(listCalendarEventsForCase).sort(compareEvents);
}

export function listCalendarEventsForCase(caseRecord: SavedCaseRecord) {
  return (caseRecord.caseTasks ?? [])
    .map((task) => buildCalendarEvent(caseRecord, task))
    .filter((event): event is CalendarEvent => Boolean(event));
}

export function groupEventsByDay(events: CalendarEvent[]) {
  return events.reduce<Record<string, CalendarEvent[]>>((groups, event) => {
    const key = dayKey(event.startAt);
    groups[key] = [...(groups[key] ?? []), event].sort(compareEvents);
    return groups;
  }, {});
}

export function getEventsForDate(events: CalendarEvent[], date: Date | string) {
  const key = dayKey(date);
  return events.filter((event) => dayKey(event.startAt) === key).sort(compareEvents);
}

export function getEventsForWeek(events: CalendarEvent[], date: Date | string) {
  const reference = parseDate(date);
  if (!reference) return [];
  const start = startOfWeek(reference);
  const end = addDays(start, 7);
  return events.filter((event) => isBetween(event.startAt, start, end)).sort(compareEvents);
}

export function getEventsForMonth(events: CalendarEvent[], date: Date | string) {
  const reference = parseDate(date);
  if (!reference) return [];
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  return events.filter((event) => isBetween(event.startAt, start, end)).sort(compareEvents);
}

export function getCalendarCounts(events: CalendarEvent[], now: Date | string = new Date()) {
  const reference = parseDate(now) ?? new Date();
  const activeEvents = events.filter(isActiveCalendarEvent);
  const upcoming = activeEvents.filter((event) => new Date(event.startAt).getTime() >= startOfDay(reference).getTime());

  return {
    total: events.length,
    today: getEventsForDate(activeEvents, reference).length,
    week: getEventsForWeek(activeEvents, reference).length,
    month: getEventsForMonth(activeEvents, reference).length,
    upcoming: upcoming.length,
    appointments: upcoming.filter((event) => event.type === "appointment").length,
    hearings: upcoming.filter((event) => event.type === "hearing").length,
    visits: upcoming.filter((event) => event.type === "visit").length,
    overdue: activeEvents.filter((event) => new Date(event.startAt).getTime() < startOfDay(reference).getTime()).length,
    cancelled: events.filter((event) => event.appointmentStatus === "cancelled").length,
    completed: events.filter((event) => event.appointmentStatus === "completed" || event.status === "done").length,
  };
}

export function buildCalendarEvent(caseRecord: SavedCaseRecord, task: CaseTask): CalendarEvent | null {
  if (!calendarTaskTypes.has(task.type)) return null;

  const startAt = getTaskStart(task);
  if (!startAt) return null;

  return {
    id: `${caseRecord.id}:${task.id}`,
    caseId: caseRecord.id,
    taskId: task.id,
    title: task.title,
    type: task.type as CalendarEvent["type"],
    status: task.status,
    appointmentStatus: resolveAppointmentStatus(task),
    priority: task.priority,
    startAt,
    endAt: getTaskEnd(task) ?? startAt,
    allDay: task.allDay,
    location: task.location,
    caseNumber: caseRecord.id,
    tenant: caseRecord.tenant,
    address: caseRecord.address,
    assignedTo: task.assignedToName ?? task.assignedTo,
    contactId: task.contactId,
    organizationId: task.organizationId,
    sourceTask: task,
    metadata: {
      ...(task.metadata ?? {}),
      source: task.source,
      participants: task.participants,
      timezone: task.timezone,
      recurrence: task.recurrence,
      hearingDetails: task.hearingDetails,
      visitDetails: task.visitDetails,
    },
  };
}

function resolveAppointmentStatus(task: CaseTask): AppointmentStatus | undefined {
  if (task.status === "done") return "completed";
  if (task.status === "dismissed" || task.status === "archived") return "cancelled";
  if (task.appointmentStatus) return task.appointmentStatus;
  return "planned";
}

function isActiveCalendarEvent(event: CalendarEvent) {
  return event.status !== "done" && event.status !== "archived" && event.status !== "dismissed" && event.appointmentStatus !== "cancelled" && event.appointmentStatus !== "completed";
}

function compareEvents(a: CalendarEvent, b: CalendarEvent) {
  return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
}

function normalizeDate(value?: string) {
  const date = parseDate(value);
  return date?.toISOString();
}

function parseDate(value?: Date | string) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(value: Date | string) {
  const date = parseDate(value);
  if (!date) return "invalid";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isBetween(value: string, start: Date, end: Date) {
  const date = parseDate(value);
  if (!date) return false;
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
