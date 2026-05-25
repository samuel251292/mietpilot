import { isTaskOverdue, normalizeTaskStatus } from "@/lib/tasks/task-service";
import type { CaseStatus, CaseTask, CaseTaskStatus, CaseTaskType, SavedCaseRecord, User } from "@/types/case";

export const dashboardStatusMapping: Record<"ready" | "active" | "won" | "lost", CaseStatus[]> = {
  ready: ["Daten geprüft", "Berechnung abgeschlossen", "Schreiben erstellt"],
  active: ["Entwurf", "Dokumente hochgeladen", "Daten geprüft", "Berechnung abgeschlossen", "Schreiben erstellt"],
  won: ["Abgeschlossen"],
  lost: ["Abgeschlossen"],
};

export type DashboardStats = ReturnType<typeof getDashboardStats>;
export type EmployeeDashboardRow = ReturnType<typeof getEmployeeDashboardRows>[number];

export function calculateMawaRevenue(record: Pick<SavedCaseRecord, "claimAmount">) {
  const claimAmount = Number(record.claimAmount) || 0;
  if (claimAmount <= 0) return 0;
  if (claimAmount <= 3000) return claimAmount;
  return 3000 + (claimAmount - 3000) * 0.55;
}

export function getDashboardStats(records: SavedCaseRecord[]) {
  const completed = records.filter((record) => record.status === "Abgeschlossen");
  const won = completed.filter(isWonCase).length;
  const lost = completed.filter(isLostCase).length;
  const totalOverpayment = records.reduce((sum, record) => sum + getClaimAmount(record), 0);
  const mawaRevenue = records.reduce((sum, record) => sum + calculateMawaRevenue(record), 0);
  const avgMonthlyExcess = average(records.map((record) => Number(record.calculation?.monthlyExcess) || 0));
  const avgInvoice = average(records.map(getClaimAmount).filter((value) => value > 0));
  const finishedCount = won + lost;
  const taskStats = getTaskDashboardStats(records);

  return {
    newCases: records.filter((record) => isToday(record.createdAt)).length,
    ready: records.filter(isReadyCase).length,
    active: records.filter(isActiveCase).length,
    won,
    lost,
    conversion: finishedCount > 0 ? Math.round((won / finishedCount) * 100) : 0,
    totalOverpayment,
    mawaRevenue,
    avgMonthlyExcess,
    aboveThreshold: records.filter((record) => getClaimAmount(record) > 1000).length,
    avgInvoice,
    cancelRate: records.length > 0 ? Math.round((lost / records.length) * 100) : 0,
    appointmentsToday: taskStats.appointmentsToday,
    appointmentsWeek: taskStats.appointmentsWeek,
    hearings: taskStats.hearings,
    visits: taskStats.visits,
    overdueReminders: taskStats.overdueReminders,
    dueReminders: taskStats.dueReminders,
    hasTasks: taskStats.hasTasks,
  };
}

export function getEmployeeDashboardRows(records: SavedCaseRecord[], employees: User[]) {
  const employeeRows = employees
    .filter((employee) => employee.role === "employee")
    .map((employee) => {
      const owned = records.filter((record) => record.ownerId === employee.id);
      return {
        id: employee.id,
        name: employee.name,
        today: owned.filter((record) => isToday(record.createdAt)).length,
        total: owned.length,
        open: owned.filter((record) => !isWonCase(record) && !isLostCase(record)).length,
        active: owned.filter(isActiveCase).length,
        won: owned.filter(isWonCase).length,
        lost: owned.filter(isLostCase).length,
      };
    });
  const unassigned = records.filter((record) => !record.ownerId);

  return [
    ...employeeRows,
    {
      id: "unassigned",
      name: "Nicht zugewiesen",
      today: unassigned.filter((record) => isToday(record.createdAt)).length,
      total: unassigned.length,
      open: unassigned.filter((record) => !isWonCase(record) && !isLostCase(record)).length,
      active: unassigned.filter(isActiveCase).length,
      won: unassigned.filter(isWonCase).length,
      lost: unassigned.filter(isLostCase).length,
    },
  ];
}

export function isToday(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
}

function isReadyCase(record: SavedCaseRecord) {
  return dashboardStatusMapping.ready.includes(record.status);
}

function isActiveCase(record: SavedCaseRecord) {
  return dashboardStatusMapping.active.includes(record.status);
}

function isWonCase(record: SavedCaseRecord) {
  return dashboardStatusMapping.won.includes(record.status) && getClaimAmount(record) > 0;
}

function isLostCase(record: SavedCaseRecord) {
  return dashboardStatusMapping.lost.includes(record.status) && getClaimAmount(record) <= 0;
}

function getClaimAmount(record: Pick<SavedCaseRecord, "claimAmount">) {
  return Math.max(Number(record.claimAmount) || 0, 0);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getTaskDashboardStats(records: Array<Pick<SavedCaseRecord, "caseTasks">>, now: Date = new Date()) {
  const tasks = records.flatMap((record) => record.caseTasks ?? []);
  const activeTasks = tasks.map((task) => normalizeTaskStatus(task, now)).filter(isActiveTask);
  const reminderTasks = activeTasks.filter((task) => reminderTypes.has(task.type));
  const appointmentTasks = activeTasks.filter((task) => appointmentTypes.has(task.type));

  return {
    hasTasks: tasks.length > 0,
    dueReminders: reminderTasks.filter((task) => isDueReminder(task, now)).length,
    overdueReminders: reminderTasks.filter((task) => isOverdueReminder(task, now)).length,
    appointmentsToday: appointmentTasks.filter((task) => isTaskScheduledToday(task, now)).length,
    appointmentsWeek: appointmentTasks.filter((task) => isTaskScheduledThisWeek(task, now)).length,
    hearings: appointmentTasks.filter((task) => task.type === "hearing" && isUpcomingTask(task, now)).length,
    visits: appointmentTasks.filter((task) => task.type === "visit" && isUpcomingTask(task, now)).length,
  };
}

const reminderTypes = new Set<CaseTaskType>(["reminder", "follow_up", "deadline"]);
const appointmentTypes = new Set<CaseTaskType>(["appointment", "hearing", "visit"]);
const terminalTaskStatuses = new Set<CaseTaskStatus>(["done", "archived", "dismissed"]);

function isActiveTask(task: CaseTask) {
  return !terminalTaskStatuses.has(task.status);
}

function isDueReminder(task: CaseTask, now: Date) {
  const date = getTaskRelevantDate(task);
  if (!date || isOverdueReminder(task, now)) return false;
  const start = startOfDay(now);
  const end = addDays(start, 7);
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function isOverdueReminder(task: CaseTask, now: Date) {
  if (isTaskOverdue(task, now)) {
    const dueAt = parseDate(task.dueAt);
    return Boolean(dueAt && !sameDay(dueAt, now));
  }
  if (task.dueAt) return false;
  const remindAt = parseDate(task.remindAt);
  return Boolean(remindAt && remindAt.getTime() < now.getTime() && !sameDay(remindAt, now));
}

function isTaskScheduledToday(task: CaseTask, now: Date) {
  const date = getTaskRelevantDate(task);
  return Boolean(date && sameDay(date, now));
}

function isTaskScheduledThisWeek(task: CaseTask, now: Date) {
  const date = getTaskRelevantDate(task);
  if (!date) return false;
  const start = startOfWeek(now);
  const end = addDays(start, 7);
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function isUpcomingTask(task: CaseTask, now: Date) {
  const date = getTaskRelevantDate(task);
  if (!date) return false;
  return date.getTime() >= startOfDay(now).getTime();
}

function getTaskRelevantDate(task: CaseTask) {
  return parseDate(task.dueAt) ?? parseDate(task.remindAt);
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(a: Date, b: Date) {
  return !Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && a.toDateString() === b.toDateString();
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
