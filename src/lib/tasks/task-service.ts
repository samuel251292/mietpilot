import type { CaseActivity, CaseTask, CaseTaskSource, CaseTaskStatus, SavedCaseRecord } from "@/types/case";

type TaskActor = {
  id?: string;
  name?: string;
};

type TaskInput = Omit<CaseTask, "id" | "caseId" | "status" | "createdAt" | "updatedAt"> & {
  id?: string;
  status?: CaseTaskStatus;
  actor?: TaskActor | null;
};

type TaskUpdate = Partial<Omit<CaseTask, "id" | "caseId" | "createdAt" | "createdBy" | "createdByName">> & {
  actor?: TaskActor | null;
};

type TaskActionOptions = {
  actor?: TaskActor | null;
  note?: string;
  completedAt?: string;
};

export function listTasks(caseRecord: Pick<SavedCaseRecord, "caseTasks">, now: Date | string = new Date()) {
  return (caseRecord.caseTasks ?? [])
    .map((task) => normalizeTaskStatus(task, now))
    .sort((a, b) => taskSortDate(a).getTime() - taskSortDate(b).getTime());
}

export function getTask(caseRecord: Pick<SavedCaseRecord, "caseTasks">, taskId: string) {
  return (caseRecord.caseTasks ?? []).find((task) => task.id === taskId);
}

export function createTask(caseRecord: SavedCaseRecord, input: TaskInput): SavedCaseRecord {
  const now = new Date().toISOString();
  const task: CaseTask = {
    id: input.id ?? createTaskId(),
    caseId: caseRecord.id,
    title: input.title.trim() || "Aufgabe",
    description: input.description,
    type: input.type,
    status: input.status ?? "open",
    priority: input.priority ?? "normal",
    dueAt: input.dueAt,
    remindAt: input.remindAt,
    completedAt: input.completedAt,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay,
    location: input.location,
    participants: input.participants,
    timezone: input.timezone,
    recurrence: input.recurrence,
    appointmentStatus: input.appointmentStatus,
    hearingDetails: input.hearingDetails,
    visitDetails: input.visitDetails,
    contactId: input.contactId,
    organizationId: input.organizationId,
    assignedTo: input.assignedTo,
    assignedToName: input.assignedToName,
    source: input.source,
    createdAt: now,
    updatedAt: now,
    createdBy: input.actor?.id ?? input.createdBy,
    createdByName: input.actor?.name ?? input.createdByName,
    metadata: input.metadata,
  };
  const normalizedTask = normalizeTaskStatus(task, now);

  return updateRecord(caseRecord, [normalizedTask, ...(caseRecord.caseTasks ?? [])], now, [
    buildTaskActivity(activityTypeForCreatedTask(normalizedTask), activityTitleForCreatedTask(normalizedTask), {
      actor: input.actor,
      createdAt: now,
      metadata: { taskId: normalizedTask.id, taskType: normalizedTask.type, source: normalizedTask.source },
    }),
  ]);
}

export function updateTask(caseRecord: SavedCaseRecord, taskId: string, updates: TaskUpdate): SavedCaseRecord {
  const now = new Date().toISOString();
  let updatedTask: CaseTask | undefined;
  const tasks = (caseRecord.caseTasks ?? []).map((task) => {
    if (task.id !== taskId) return task;
    updatedTask = normalizeTaskStatus({ ...task, ...updates, updatedAt: now }, now);
    return updatedTask;
  });

  if (!updatedTask) throw new Error("Aufgabe wurde nicht gefunden.");

  return updateRecord(caseRecord, tasks, now, [
    buildTaskActivity("task_updated", "Aufgabe aktualisiert", {
      actor: updates.actor,
      createdAt: now,
      metadata: { taskId, taskType: updatedTask.type, status: updatedTask.status },
    }),
  ]);
}

export function completeTask(caseRecord: SavedCaseRecord, taskId: string, options: TaskActionOptions = {}): SavedCaseRecord {
  const completedAt = options.completedAt ?? new Date().toISOString();
  const task = getTask(caseRecord, taskId);
  const nextRecord = updateTask(caseRecord, taskId, {
    status: "done",
    completedAt,
    metadata: { ...(task?.metadata ?? {}), completionNote: options.note },
    actor: options.actor,
  });
  return replaceLastTaskActivity(nextRecord, "task_completed", task?.type === "reminder" ? "Erinnerung erledigt" : "Aufgabe erledigt", options, taskId);
}

export function archiveTask(caseRecord: SavedCaseRecord, taskId: string, options: TaskActionOptions = {}): SavedCaseRecord {
  const task = getTask(caseRecord, taskId);
  const nextRecord = updateTask(caseRecord, taskId, {
    status: "archived",
    metadata: { ...(task?.metadata ?? {}), archiveNote: options.note },
    actor: options.actor,
  });
  return replaceLastTaskActivity(nextRecord, "task_archived", "Aufgabe archiviert", options, taskId);
}

export function dismissTask(caseRecord: SavedCaseRecord, taskId: string, options: TaskActionOptions = {}): SavedCaseRecord {
  const task = getTask(caseRecord, taskId);
  const nextRecord = updateTask(caseRecord, taskId, {
    status: "dismissed",
    metadata: { ...(task?.metadata ?? {}), dismissNote: options.note },
    actor: options.actor,
  });
  return replaceLastTaskActivity(nextRecord, "task_archived", "Aufgabe verworfen", options, taskId);
}

export function markTaskInProgress(caseRecord: SavedCaseRecord, taskId: string, actor?: TaskActor | null): SavedCaseRecord {
  return updateTask(caseRecord, taskId, { status: "in_progress", actor });
}

export function isTaskOverdue(task: Pick<CaseTask, "dueAt" | "status">, now: Date | string = new Date()) {
  if (!task.dueAt) return false;
  if (task.status === "done" || task.status === "archived" || task.status === "dismissed") return false;
  const due = new Date(task.dueAt);
  const reference = typeof now === "string" ? new Date(now) : now;
  if (Number.isNaN(due.getTime()) || Number.isNaN(reference.getTime())) return false;
  return due.getTime() < reference.getTime();
}

export function normalizeTaskStatus(task: CaseTask, now: Date | string = new Date()): CaseTask {
  if (isTaskOverdue(task, now)) return { ...task, status: "overdue" };
  if (task.status === "overdue" && !isTaskOverdue(task, now)) return { ...task, status: "open" };
  return task;
}

export function getTaskCounts(records: Array<Pick<SavedCaseRecord, "caseTasks">>, now: Date | string = new Date()) {
  const tasks = records.flatMap((record) => listTasks(record, now));
  const openStatuses: CaseTaskStatus[] = ["open", "in_progress", "overdue"];

  return {
    total: tasks.length,
    open: tasks.filter((task) => openStatuses.includes(task.status)).length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    done: tasks.filter((task) => task.status === "done").length,
    dismissed: tasks.filter((task) => task.status === "dismissed").length,
    archived: tasks.filter((task) => task.status === "archived").length,
    overdue: tasks.filter((task) => normalizeTaskStatus(task, now).status === "overdue").length,
    dueToday: tasks.filter((task) => isDueToday(task, now)).length,
    dueThisWeek: tasks.filter((task) => isDueThisWeek(task, now)).length,
    reminders: tasks.filter((task) => task.type === "reminder").length,
    followUps: tasks.filter((task) => task.type === "follow_up").length,
    appointmentsToday: tasks.filter((task) => task.type === "appointment" && isDueToday(task, now)).length,
    hearings: tasks.filter((task) => task.type === "hearing").length,
    visits: tasks.filter((task) => task.type === "visit").length,
  };
}

export function findTasksBySource(caseRecord: Pick<SavedCaseRecord, "caseTasks">, source: CaseTaskSource) {
  return (caseRecord.caseTasks ?? []).filter((task) => matchesSource(task.source, source.type, source.id ?? source.label));
}

export function hasTaskForSource(caseRecord: Pick<SavedCaseRecord, "caseTasks">, sourceType: CaseTaskSource["type"], sourceIdOrLabel?: string) {
  return (caseRecord.caseTasks ?? []).some((task) => matchesSource(task.source, sourceType, sourceIdOrLabel));
}

function updateRecord(caseRecord: SavedCaseRecord, caseTasks: CaseTask[], updatedAt: string, activities: CaseActivity[]): SavedCaseRecord {
  return {
    ...caseRecord,
    caseTasks,
    updatedAt,
    lastActivity: formatActivityDate(updatedAt),
    activityLog: [...activities, ...(caseRecord.activityLog ?? [])],
  };
}

function replaceLastTaskActivity(record: SavedCaseRecord, type: CaseActivity["type"], title: string, options: TaskActionOptions, taskId: string): SavedCaseRecord {
  const [first, ...rest] = record.activityLog ?? [];
  const activity = buildTaskActivity(type, title, {
    actor: options.actor,
    description: options.note,
    createdAt: first?.createdAt,
    metadata: { taskId },
  });
  return { ...record, activityLog: [activity, ...rest] };
}

function buildTaskActivity(
  type: CaseActivity["type"],
  title: string,
  options: {
    actor?: TaskActor | null;
    description?: string;
    createdAt?: string;
    metadata?: Record<string, unknown>;
  } = {},
): CaseActivity {
  return {
    id: createActivityId(),
    type,
    title,
    description: options.description,
    userId: options.actor?.id,
    userName: options.actor?.name,
    createdAt: options.createdAt ?? new Date().toISOString(),
    metadata: options.metadata,
  };
}

function activityTypeForCreatedTask(task: CaseTask): CaseActivity["type"] {
  if (task.type === "reminder") return "reminder_created";
  if (task.type === "follow_up") return "follow_up_created";
  return "task_created";
}

function activityTitleForCreatedTask(task: CaseTask) {
  if (task.type === "reminder") return "Erinnerung erstellt";
  if (task.type === "follow_up") return "Follow-up erstellt";
  return "Aufgabe erstellt";
}

function matchesSource(source: CaseTaskSource | undefined, sourceType: CaseTaskSource["type"], sourceIdOrLabel?: string) {
  if (!source || source.type !== sourceType) return false;
  if (!sourceIdOrLabel) return true;
  return source.id === sourceIdOrLabel || source.label === sourceIdOrLabel;
}

function taskSortDate(task: CaseTask) {
  const value = task.dueAt ?? task.remindAt ?? task.createdAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(8640000000000000) : date;
}

function isDueToday(task: CaseTask, now: Date | string) {
  if (!task.dueAt || task.status === "done" || task.status === "archived" || task.status === "dismissed") return false;
  const due = new Date(task.dueAt);
  const reference = typeof now === "string" ? new Date(now) : now;
  return sameDay(due, reference);
}

function isDueThisWeek(task: CaseTask, now: Date | string) {
  if (!task.dueAt || task.status === "done" || task.status === "archived" || task.status === "dismissed") return false;
  const due = new Date(task.dueAt);
  const reference = typeof now === "string" ? new Date(now) : now;
  if (Number.isNaN(due.getTime()) || Number.isNaN(reference.getTime())) return false;
  const start = startOfDay(reference);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return due.getTime() >= start.getTime() && due.getTime() <= end.getTime();
}

function sameDay(a: Date, b: Date) {
  return !Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && a.toDateString() === b.toDateString();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function createTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createActivityId() {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(date);
}
