import { calculateMawaRevenue } from "@/lib/dashboard-metrics";
import { getDocumentQuality, getRequiredDocumentStatus, requiredDocumentTypes } from "@/lib/documents/document-quality";
import { getCalendarCounts, listCalendarEvents } from "@/lib/calendar/calendar-service";
import { isTaskOverdue, listTasks, normalizeTaskStatus } from "@/lib/tasks/task-service";
import type { CaseStatus, CaseTask, CaseTaskPriority, CaseTaskStatus, CommunicationMessage, GeneratedLetterStatus, GeneratedLetterVersion, SavedCaseDocument, SavedCaseRecord } from "@/types/case";

export type AnalyticsRange = "all" | "last30" | "last90" | "year" | "custom";

export type AnalyticsOptions = {
  range?: AnalyticsRange;
  customStart?: string;
  customEnd?: string;
  now?: Date | string;
};

export type AnalyticsDateRange = {
  range: AnalyticsRange;
  from?: string;
  to?: string;
  label: string;
};

export function buildAnalyticsReport(records: SavedCaseRecord[], options: AnalyticsOptions = {}) {
  const dateRange = getAnalyticsDateRange(records, options.range ?? "all", options);
  const filteredRecords = filterRecordsByDateRange(records, dateRange, options);

  return {
    dateRange,
    generatedAt: new Date().toISOString(),
    records: filteredRecords,
    cases: calculateCaseAnalytics(filteredRecords),
    financials: calculateFinancialAnalytics(filteredRecords),
    documents: calculateDocumentAnalytics(filteredRecords),
    letters: calculateLetterAnalytics(filteredRecords),
    communication: calculateCommunicationAnalytics(filteredRecords),
    tasks: calculateTaskAnalytics(filteredRecords, options.now),
    calendar: calculateCalendarAnalytics(filteredRecords, options.now),
    employees: calculateEmployeeAnalytics(filteredRecords),
    series: {
      cases: buildMonthlyCaseSeries(filteredRecords),
      financials: buildMonthlyFinancialSeries(filteredRecords),
    },
    distributions: {
      cases: buildStatusDistribution(filteredRecords),
      documents: buildDocumentQualityDistribution(filteredRecords),
      letters: buildLetterStatusDistribution(filteredRecords),
      communication: buildCommunicationStatusDistribution(filteredRecords),
      taskPriorities: buildTaskPriorityDistribution(filteredRecords),
      taskStatuses: buildTaskStatusDistribution(filteredRecords),
    },
    workload: buildEmployeeWorkloadSeries(filteredRecords, options.now),
    performance: buildEmployeePerformanceAnalytics(filteredRecords, options.now),
    quality: {
      documents: buildDocumentQualityAnalytics(filteredRecords),
      extraction: buildExtractionAnalytics(filteredRecords),
      reviewBacklog: buildReviewBacklogAnalytics(filteredRecords),
      ocr: buildOcrAnalytics(filteredRecords),
    },
  };
}

export function getAnalyticsDateRange(records: SavedCaseRecord[], range: AnalyticsRange = "all", options: AnalyticsOptions = {}): AnalyticsDateRange {
  const now = parseDate(options.now) ?? new Date();
  const to = endOfDay(now);

  if (range === "last30") {
    return { range, from: addDays(startOfDay(now), -29).toISOString(), to: to.toISOString(), label: "Letzte 30 Tage" };
  }

  if (range === "last90") {
    return { range, from: addDays(startOfDay(now), -89).toISOString(), to: to.toISOString(), label: "Letzte 90 Tage" };
  }

  if (range === "year") {
    return { range, from: new Date(now.getFullYear(), 0, 1).toISOString(), to: to.toISOString(), label: String(now.getFullYear()) };
  }

  if (range === "custom") {
    const from = parseDate(options.customStart)?.toISOString();
    const customTo = parseDate(options.customEnd);
    return {
      range,
      from,
      to: customTo ? endOfDay(customTo).toISOString() : to.toISOString(),
      label: "Benutzerdefiniert",
    };
  }

  const dates = records.flatMap((record) => [record.createdAt, record.updatedAt]).map(parseDate).filter((date): date is Date => Boolean(date));
  const earliest = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : undefined;
  return { range: "all", from: earliest?.toISOString(), to: to.toISOString(), label: "Alle Zeiträume" };
}

export function filterRecordsByDateRange(records: SavedCaseRecord[], range: AnalyticsRange | AnalyticsDateRange = "all", options: AnalyticsOptions = {}) {
  const dateRange = typeof range === "string" ? getAnalyticsDateRange(records, range, options) : range;
  if (dateRange.range === "all" || (!dateRange.from && !dateRange.to)) return records;

  const from = dateRange.from ? new Date(dateRange.from).getTime() : Number.NEGATIVE_INFINITY;
  const to = dateRange.to ? new Date(dateRange.to).getTime() : Number.POSITIVE_INFINITY;

  return records.filter((record) => {
    const created = parseDate(record.createdAt)?.getTime();
    const updated = parseDate(record.updatedAt)?.getTime();
    return isTimestampInRange(created, from, to) || isTimestampInRange(updated, from, to);
  });
}

export function calculateCaseAnalytics(records: SavedCaseRecord[]) {
  const completed = records.filter((record) => record.status === "Abgeschlossen");
  const won = completed.filter((record) => getClaimAmount(record) > 0).length;
  const lost = completed.length - won;

  return {
    totalCases: records.length,
    newCases: records.filter((record) => isToday(record.createdAt)).length,
    activeCases: records.filter((record) => record.status !== "Abgeschlossen").length,
    completedCases: completed.length,
    wonCases: won,
    lostCases: lost,
    conversion: completed.length ? Math.round((won / completed.length) * 100) : 0,
  };
}

export function calculateFinancialAnalytics(records: SavedCaseRecord[]) {
  const settlementValues = records.map(getSettlementAmount).filter((value) => value > 0);

  return {
    totalClaim: sum(records.map(getClaimAmount)),
    openClaim: sum(records.map(getOpenClaimAmount)),
    settlementAmounts: sum(settlementValues),
    mawaRevenue: sum(records.map(calculateMawaRevenue)),
    averageMonthlyOverpayment: average(records.map((record) => Number(record.calculation?.monatliche_ueberzahlung ?? record.calculation?.monthlyExcess) || 0)),
    averageSettlementAmount: average(settlementValues),
  };
}

export function calculateDocumentAnalytics(records: SavedCaseRecord[]) {
  const documents = records.flatMap((record) => record.documents ?? []);
  const qualityWarnings = records.flatMap((record) => getDocumentQuality(record).warnings);

  return {
    totalDocuments: documents.length,
    successful: documents.filter((document) => document.extractionStatus === "success").length,
    ocrUsed: documents.filter(hasOcrUsedWarning).length,
    ocrRequired: documents.filter(hasOcrRequiredWarning).length,
    failed: documents.filter((document) => document.extractionStatus === "failed").length,
    legacy: documents.filter((document) => !document.dataUrl || document.source === "legacy").length,
    pendingChanges: records.reduce((count, record) => count + (record.pendingExtractedChanges?.filter((change) => change.changed).length ?? 0), 0),
    qualityWarnings: qualityWarnings.length,
  };
}

export function calculateLetterAnalytics(records: SavedCaseRecord[]) {
  const letters = records.flatMap((record) => record.generatedLetters ?? []);

  return {
    totalLetters: letters.length,
    draft: letters.filter((letter) => letter.status === "draft").length,
    ready: letters.filter((letter) => letter.status === "ready" || letter.review?.status === "ready").length,
    review: letters.filter(isLetterInReview).length,
    sent: letters.filter((letter) => letter.status === "sent" || Boolean(letter.sent?.sentAt)).length,
    archived: letters.filter((letter) => letter.status === "archived").length,
    outdated: letters.filter((letter) => letter.status === "outdated" || letter.outdated).length,
    approved: letters.filter((letter) => Boolean(letter.approval?.approvedAt) || letter.review?.status === "approved").length,
    openReviews: letters.filter(isLetterInReview).length,
  };
}

export function calculateCommunicationAnalytics(records: SavedCaseRecord[]) {
  const threads = records.flatMap((record) => record.communicationThreads ?? []);
  const messages = threads.flatMap((thread) => thread.messages ?? []);

  return {
    threads: threads.length,
    messages: messages.length,
    drafts: messages.filter((message) => message.status === "draft").length,
    ready: messages.filter((message) => message.status === "ready" || message.status === "queued").length,
    sent: messages.filter((message) => message.status === "sent").length,
    failed: messages.filter((message) => message.status === "failed").length,
    received: messages.filter((message) => message.status === "received").length,
  };
}

export function calculateTaskAnalytics(records: SavedCaseRecord[], now: Date | string = new Date()) {
  const tasks = records.flatMap((record) => listTasks(record, now));
  const activeTasks = tasks.filter((task) => !terminalTaskStatuses.has(task.status));

  return {
    totalTasks: tasks.length,
    openTasks: activeTasks.filter((task) => task.status === "open" || task.status === "in_progress" || task.status === "overdue").length,
    overdueTasks: tasks.filter((task) => normalizeTaskStatus(task, now).status === "overdue" || isTaskOverdue(task, now)).length,
    completedTasks: tasks.filter((task) => task.status === "done").length,
    dismissedTasks: tasks.filter((task) => task.status === "dismissed").length,
    archivedTasks: tasks.filter((task) => task.status === "archived").length,
  };
}

export function calculateCalendarAnalytics(records: SavedCaseRecord[], now: Date | string = new Date()) {
  const counts = getCalendarCounts(listCalendarEvents(records), now);

  return {
    appointmentsToday: counts.today,
    appointmentsWeek: counts.week,
    hearings: counts.hearings,
    visits: counts.visits,
    customerAppointments: counts.appointments,
    overdueAppointments: counts.overdue,
  };
}

export function calculateEmployeeAnalytics(records: SavedCaseRecord[]) {
  const employees = new Map<string, EmployeeAnalyticsRow>();

  for (const record of records) {
    const owner = ensureEmployee(employees, record.ownerId, record.ownerName);
    owner.cases += 1;
    if (record.status !== "Abgeschlossen") owner.activeCases += 1;

    for (const task of record.caseTasks ?? []) {
      const employee = ensureEmployee(employees, task.assignedTo, task.assignedToName);
      if (!terminalTaskStatuses.has(normalizeTaskStatus(task).status)) employee.openTasks += 1;
      if (task.type === "appointment" || task.type === "hearing" || task.type === "visit") employee.appointments += 1;
    }

    for (const letter of record.generatedLetters ?? []) {
      const employee = ensureEmployee(employees, letter.createdBy, undefined);
      employee.letters += 1;
    }

    for (const message of getMessages(record)) {
      const employee = ensureEmployee(employees, message.createdBy, message.createdByName);
      employee.communication += 1;
    }
  }

  return [...employees.values()].sort((a, b) => b.cases + b.openTasks + b.appointments + b.letters + b.communication - (a.cases + a.openTasks + a.appointments + a.letters + a.communication));
}

export type MonthlyCaseSeriesPoint = {
  month: string;
  label: string;
  newCases: number;
  completedCases: number;
  sentLetters: number;
  sentMessages: number;
};

export type MonthlyFinancialSeriesPoint = {
  month: string;
  label: string;
  totalClaim: number;
  settlementAmounts: number;
};

export type DistributionPoint = {
  key: string;
  label: string;
  value: number;
};

export type EmployeeWorkloadPoint = EmployeeAnalyticsRow & {
  overdueTasks: number;
  appointmentsThisWeek: number;
};

export type EmployeePerformanceRow = {
  id: string;
  name: string;
  casesTotal: number;
  activeCases: number;
  completedCases: number;
  openTasks: number;
  overdueTasks: number;
  completedTasks: number;
  appointmentsThisWeek: number;
  hearings: number;
  visits: number;
  lettersTotal: number;
  approvedLetters: number;
  sentLetters: number;
  messagesTotal: number;
  sentMessages: number;
  failedMessages: number;
  totalClaimAmount: number;
  settlementAmounts: number;
  openClaimAmount: number;
  lastActivity?: string;
  activityLogCount: number;
  lastEditedCaseId?: string;
  lastEditedCaseLabel?: string;
  communicationActivity: number;
  calendarLoad: number;
};

export type DocumentRiskItem = {
  id: string;
  caseId: string;
  tenant: string;
  address: string;
  issue: string;
  severity: "high" | "medium" | "low";
  type: "missing_document" | "ocr_required" | "failed_extraction" | "pending_changes" | "open_review" | "quality_warning";
};

export type EmployeeQualityRow = {
  id: string;
  name: string;
  qualityProblemCases: number;
  ocrCases: number;
  openReviews: number;
  pendingChanges: number;
};

export function buildDocumentQualityAnalytics(records: SavedCaseRecord[]) {
  const documents = records.flatMap((record) => record.documents ?? []);
  const requiredStatuses = records.map((record) => ({ record, statuses: getRequiredDocumentStatus(record), quality: getDocumentQuality(record) }));
  const missingRequiredDocuments = requiredStatuses.reduce((count, item) => count + requiredDocumentTypes.filter((type) => item.statuses[type] === "fehlt").length, 0);
  const documentsWithWarnings = documents.filter((document) => (document.extractionWarnings?.length ?? 0) > 0).length;
  const casesWithQualityProblems = requiredStatuses.filter((item) => item.quality.needsReview || item.quality.warnings.length > 0).length;

  return {
    totalDocuments: documents.length,
    successful: documents.filter((document) => document.extractionStatus === "success").length,
    ocrUsed: documents.filter(hasOcrUsedWarning).length,
    ocrRequired: documents.filter(hasOcrRequiredWarning).length,
    failed: documents.filter((document) => document.extractionStatus === "failed").length,
    legacy: documents.filter((document) => !document.dataUrl || document.source === "legacy").length,
    pendingChanges: countPendingChanges(records),
    documentsWithWarnings,
    missingRequiredDocuments,
    casesWithQualityProblems,
    statusDistribution: buildDocumentQualityDistribution(records),
    employeeQuality: buildEmployeeDocumentQualityAnalytics(records),
    riskItems: buildDocumentRiskItems(records),
  };
}

export function buildExtractionAnalytics(records: SavedCaseRecord[]) {
  const documents = records.flatMap((record) => record.documents ?? []);
  const extractableDocuments = documents.filter((document) => document.extractionStatus && document.extractionStatus !== "not_applicable");
  const successful = extractableDocuments.filter((document) => document.extractionStatus === "success").length;
  const warnings = documents.flatMap((document) => document.extractionWarnings ?? []);
  const fieldCounts = documents.map((document) => countExtractedFields(document.extractedFields)).filter((count) => count > 0);
  const textLengths = documents.map((document) => Number(document.extractedTextLength) || 0).filter((length) => length > 0);

  return {
    successRate: extractableDocuments.length ? Math.round((successful / extractableDocuments.length) * 100) : 0,
    failedExtractions: extractableDocuments.filter((document) => document.extractionStatus === "failed").length,
    averageExtractedFields: average(fieldCounts),
    averageTextLength: average(textLengths),
    commonWarnings: buildWarningDistribution(warnings),
  };
}

export function buildReviewBacklogAnalytics(records: SavedCaseRecord[]) {
  const letters = records.flatMap((record) => record.generatedLetters ?? []);
  const openLetterReviews = letters.filter(isLetterInReview).length;
  const pendingChanges = countPendingChanges(records);
  const unapprovedLetters = letters.filter((letter) => letter.status !== "archived" && letter.status !== "sent" && !letter.approval?.approvedAt).length;
  const outdatedLetters = letters.filter((letter) => letter.outdated || letter.status === "outdated").length;
  const casesWithMultipleQualityWarnings = records.filter((record) => getDocumentQuality(record).warnings.length > 1).length;

  return {
    openReviews: openLetterReviews + pendingChanges,
    openLetterReviews,
    pendingExtractionChanges: pendingChanges,
    unapprovedLetters,
    outdatedLetters,
    casesWithMultipleQualityWarnings,
  };
}

export function buildOcrAnalytics(records: SavedCaseRecord[]) {
  const documents = records.flatMap((record) => record.documents ?? []);
  const ocrUsed = documents.filter(hasOcrUsedWarning).length;
  const ocrRequired = documents.filter(hasOcrRequiredWarning).length;
  const ocrRelevantDocuments = documents.filter((document) => document.mimeType?.includes("pdf") || document.fileName.toLowerCase().endsWith(".pdf") || hasOcrUsedWarning(document) || hasOcrRequiredWarning(document));

  return {
    ocrRate: ocrRelevantDocuments.length ? Math.round((ocrUsed / ocrRelevantDocuments.length) * 100) : 0,
    ocrUsed,
    ocrRequired,
    ocrRelevantDocuments: ocrRelevantDocuments.length,
    casesWithOcr: records.filter((record) => (record.documents ?? []).some((document) => hasOcrUsedWarning(document) || hasOcrRequiredWarning(document))).length,
  };
}

export function buildEmployeePerformanceAnalytics(records: SavedCaseRecord[], now: Date | string = new Date()): EmployeePerformanceRow[] {
  const rows = new Map<string, EmployeePerformanceRow>();
  mergeEmployeeRows(rows, buildEmployeeTaskAnalytics(records, now));
  mergeEmployeeRows(rows, buildEmployeeCalendarAnalytics(records, now));
  mergeEmployeeRows(rows, buildEmployeeCommunicationAnalytics(records));

  for (const record of records) {
    const owner = ensurePerformanceEmployee(rows, record.ownerId, record.ownerName);
    owner.casesTotal += 1;
    owner.totalClaimAmount += getClaimAmount(record);
    owner.settlementAmounts += getSettlementAmount(record);
    owner.openClaimAmount += getOpenClaimAmount(record);
    owner.activityLogCount += record.activityLog?.length ?? 0;
    if (record.status === "Abgeschlossen") owner.completedCases += 1;
    else owner.activeCases += 1;
    updateLastActivity(owner, record.updatedAt, record);

    for (const letter of record.generatedLetters ?? []) {
      const employee = ensurePerformanceEmployee(rows, letter.createdBy, undefined);
      employee.lettersTotal += 1;
      if (letter.approval?.approvedAt || letter.review?.status === "approved") employee.approvedLetters += 1;
      if (letter.status === "sent" || letter.sent?.sentAt) employee.sentLetters += 1;
      updateLastActivity(employee, letter.sent?.sentAt ?? letter.createdAt, record);
    }
  }

  return sortEmployeePerformance([...rows.values()]);
}

function buildEmployeeDocumentQualityAnalytics(records: SavedCaseRecord[]) {
  const employees = new Map<string, EmployeeQualityRow>();
  for (const record of records) {
    const employee = ensureEmployeeQualityRow(employees, record.ownerId, record.ownerName);
    const quality = getDocumentQuality(record);
    const pendingChanges = record.pendingExtractedChanges?.filter((change) => change.changed).length ?? 0;
    if (quality.needsReview || quality.warnings.length > 0) employee.qualityProblemCases += 1;
    if ((record.documents ?? []).some((document) => hasOcrUsedWarning(document) || hasOcrRequiredWarning(document))) employee.ocrCases += 1;
    employee.pendingChanges += pendingChanges;
    employee.openReviews += pendingChanges + (record.generatedLetters ?? []).filter(isLetterInReview).length;
  }
  return [...employees.values()].sort((a, b) => b.qualityProblemCases + b.openReviews + b.pendingChanges - (a.qualityProblemCases + a.openReviews + a.pendingChanges));
}

export function buildEmployeeFinancialAnalytics(records: SavedCaseRecord[]): EmployeePerformanceRow[] {
  const rows = new Map<string, EmployeePerformanceRow>();
  for (const record of records) {
    const employee = ensurePerformanceEmployee(rows, record.ownerId, record.ownerName);
    employee.totalClaimAmount += getClaimAmount(record);
    employee.settlementAmounts += getSettlementAmount(record);
    employee.openClaimAmount += getOpenClaimAmount(record);
  }
  return [...rows.values()];
}

export function buildEmployeeCommunicationAnalytics(records: SavedCaseRecord[]): EmployeePerformanceRow[] {
  const rows = new Map<string, EmployeePerformanceRow>();
  for (const record of records) {
    for (const message of getMessages(record)) {
      const employee = ensurePerformanceEmployee(rows, message.createdBy, message.createdByName);
      employee.messagesTotal += 1;
      employee.communicationActivity += 1;
      if (message.status === "sent") employee.sentMessages += 1;
      if (message.status === "failed") employee.failedMessages += 1;
      updateLastActivity(employee, message.sentAt ?? message.createdAt, record);
    }
  }
  return [...rows.values()];
}

export function buildEmployeeTaskAnalytics(records: SavedCaseRecord[], now: Date | string = new Date()): EmployeePerformanceRow[] {
  const rows = new Map<string, EmployeePerformanceRow>();
  for (const record of records) {
    for (const task of record.caseTasks ?? []) {
      const normalizedTask = normalizeTaskStatus(task, now);
      const employee = ensurePerformanceEmployee(rows, task.assignedTo, task.assignedToName);
      if (normalizedTask.status === "done") employee.completedTasks += 1;
      if (!terminalTaskStatuses.has(normalizedTask.status)) employee.openTasks += 1;
      if (normalizedTask.status === "overdue") employee.overdueTasks += 1;
      updateLastActivity(employee, task.updatedAt ?? task.createdAt, record);
    }
  }
  return [...rows.values()];
}

export function buildEmployeeCalendarAnalytics(records: SavedCaseRecord[], now: Date | string = new Date()): EmployeePerformanceRow[] {
  const rows = new Map<string, EmployeePerformanceRow>();
  const events = listCalendarEvents(records);
  for (const event of events) {
    const employee = ensurePerformanceEmployee(rows, event.sourceTask.assignedTo, event.sourceTask.assignedToName);
    const counts = getCalendarCounts([event], now);
    employee.appointmentsThisWeek += counts.week;
    employee.calendarLoad += counts.week;
    if (event.type === "hearing") employee.hearings += 1;
    if (event.type === "visit") employee.visits += 1;
    updateLastActivity(employee, event.sourceTask.updatedAt ?? event.sourceTask.createdAt, records.find((record) => record.id === event.caseId));
  }
  return [...rows.values()];
}

export function buildMonthlyCaseSeries(records: SavedCaseRecord[]): MonthlyCaseSeriesPoint[] {
  const months = createMonthBuckets(records);

  for (const record of records) {
    incrementMonth(months, record.createdAt, "newCases", 1);
    if (record.status === "Abgeschlossen") incrementMonth(months, record.updatedAt, "completedCases", 1);

    for (const letter of record.generatedLetters ?? []) {
      if (letter.status === "sent" || letter.sent?.sentAt) incrementMonth(months, letter.sent?.sentAt ?? letter.createdAt, "sentLetters", 1);
    }

    for (const message of getMessages(record)) {
      if (message.status === "sent") incrementMonth(months, message.sentAt ?? message.createdAt, "sentMessages", 1);
    }
  }

  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function buildMonthlyFinancialSeries(records: SavedCaseRecord[]): MonthlyFinancialSeriesPoint[] {
  const months = createMonthBuckets(records);

  for (const record of records) {
    incrementMonth(months, record.createdAt, "totalClaim", getClaimAmount(record));
    incrementMonth(months, record.createdAt, "settlementAmounts", getSettlementAmount(record));
  }

  return [...months.values()].map((point) => ({
    month: point.month,
    label: point.label,
    totalClaim: point.totalClaim,
    settlementAmounts: point.settlementAmounts,
  })).sort((a, b) => a.month.localeCompare(b.month));
}

export function buildStatusDistribution(records: SavedCaseRecord[]): DistributionPoint[] {
  const statuses: CaseStatus[] = ["Entwurf", "Dokumente hochgeladen", "Daten geprüft", "Berechnung abgeschlossen", "Schreiben erstellt", "Abgeschlossen"];
  return statuses.map((status) => ({ key: status, label: status, value: records.filter((record) => record.status === status).length }));
}

export function buildDocumentQualityDistribution(records: SavedCaseRecord[]): DistributionPoint[] {
  const documents = records.flatMap((record) => record.documents ?? []);
  const pendingChanges = records.reduce((count, record) => count + (record.pendingExtractedChanges?.filter((change) => change.changed).length ?? 0), 0);
  return [
    { key: "success", label: "Erfolgreich analysiert", value: documents.filter((document) => document.extractionStatus === "success").length },
    { key: "ocr_used", label: "OCR verwendet", value: documents.filter(hasOcrUsedWarning).length },
    { key: "ocr_required", label: "OCR nötig", value: documents.filter(hasOcrRequiredWarning).length },
    { key: "failed", label: "Fehlgeschlagen", value: documents.filter((document) => document.extractionStatus === "failed").length },
    { key: "legacy", label: "Legacy", value: documents.filter((document) => !document.dataUrl || document.source === "legacy").length },
    { key: "pending", label: "Ungeprüfte Änderungen", value: pendingChanges },
  ];
}

export function buildLetterStatusDistribution(records: SavedCaseRecord[]): DistributionPoint[] {
  const letters = records.flatMap((record) => record.generatedLetters ?? []);
  const statuses: GeneratedLetterStatus[] = ["draft", "generated", "review", "ready", "sent", "archived", "outdated"];
  return statuses.map((status) => ({ key: status, label: letterStatusLabel(status), value: letters.filter((letter) => letter.status === status).length }));
}

export function buildCommunicationStatusDistribution(records: SavedCaseRecord[]): DistributionPoint[] {
  const messages = records.flatMap(getMessages);
  const statuses: CommunicationMessage["status"][] = ["draft", "ready", "queued", "sent", "failed", "received", "archived"];
  return statuses.map((status) => ({ key: status, label: communicationStatusLabel(status), value: messages.filter((message) => message.status === status).length }));
}

export function buildTaskPriorityDistribution(records: SavedCaseRecord[]): DistributionPoint[] {
  const tasks = records.flatMap((record) => record.caseTasks ?? []);
  const priorities: CaseTaskPriority[] = ["low", "normal", "high", "urgent"];
  return priorities.map((priority) => ({ key: priority, label: taskPriorityLabel(priority), value: tasks.filter((task) => task.priority === priority).length }));
}

export function buildTaskStatusDistribution(records: SavedCaseRecord[]): DistributionPoint[] {
  const tasks = records.flatMap((record) => record.caseTasks ?? []).map((task) => normalizeTaskStatus(task));
  const statuses: CaseTaskStatus[] = ["open", "in_progress", "overdue", "done", "dismissed", "archived"];
  return statuses.map((status) => ({ key: status, label: taskStatusLabel(status), value: tasks.filter((task) => task.status === status).length }));
}

export function buildEmployeeWorkloadSeries(records: SavedCaseRecord[], now: Date | string = new Date()): EmployeeWorkloadPoint[] {
  const employees = new Map<string, EmployeeWorkloadPoint>();
  const weekEvents = listCalendarEvents(records).filter((event) => getCalendarCounts([event], now).week > 0);

  for (const record of records) {
    const owner = ensureWorkloadEmployee(employees, record.ownerId, record.ownerName);
    owner.cases += 1;
    if (record.status !== "Abgeschlossen") owner.activeCases += 1;

    for (const task of record.caseTasks ?? []) {
      const normalizedTask = normalizeTaskStatus(task, now);
      const employee = ensureWorkloadEmployee(employees, task.assignedTo, task.assignedToName);
      if (!terminalTaskStatuses.has(normalizedTask.status)) employee.openTasks += 1;
      if (normalizedTask.status === "overdue") employee.overdueTasks += 1;
    }

    for (const event of weekEvents.filter((item) => item.caseId === record.id)) {
      const employee = ensureWorkloadEmployee(employees, event.sourceTask.assignedTo, event.sourceTask.assignedToName);
      employee.appointments += 1;
      employee.appointmentsThisWeek += 1;
    }

    for (const letter of record.generatedLetters ?? []) {
      ensureWorkloadEmployee(employees, letter.createdBy, undefined).letters += 1;
    }

    for (const message of getMessages(record)) {
      ensureWorkloadEmployee(employees, message.createdBy, message.createdByName).communication += 1;
    }
  }

  return [...employees.values()].sort((a, b) => b.openTasks + b.overdueTasks + b.appointmentsThisWeek + b.cases - (a.openTasks + a.overdueTasks + a.appointmentsThisWeek + a.cases));
}

export type EmployeeAnalyticsRow = {
  id: string;
  name: string;
  cases: number;
  activeCases: number;
  openTasks: number;
  appointments: number;
  letters: number;
  communication: number;
};

type MonthlyAnalyticsBucket = MonthlyCaseSeriesPoint & MonthlyFinancialSeriesPoint;

function createMonthBuckets(records: SavedCaseRecord[]) {
  const months = new Map<string, MonthlyAnalyticsBucket>();
  const dates = records.flatMap((record) => [
    record.createdAt,
    record.updatedAt,
    ...(record.generatedLetters ?? []).map((letter) => letter.sent?.sentAt ?? letter.createdAt),
    ...getMessages(record).map((message) => message.sentAt ?? message.createdAt),
  ]);

  for (const value of dates) {
    const key = monthKey(value);
    if (key) ensureMonthBucket(months, key);
  }

  return months;
}

function ensureMonthBucket(months: Map<string, MonthlyAnalyticsBucket>, key: string) {
  const existing = months.get(key);
  if (existing) return existing;
  const bucket: MonthlyAnalyticsBucket = {
    month: key,
    label: formatMonthLabel(key),
    newCases: 0,
    completedCases: 0,
    sentLetters: 0,
    sentMessages: 0,
    totalClaim: 0,
    settlementAmounts: 0,
  };
  months.set(key, bucket);
  return bucket;
}

function incrementMonth<Key extends keyof MonthlyAnalyticsBucket>(months: Map<string, MonthlyAnalyticsBucket>, value: string | undefined, key: Key, amount: number) {
  const month = monthKey(value);
  if (!month || typeof ensureMonthBucket(months, month)[key] !== "number") return;
  (ensureMonthBucket(months, month)[key] as number) += amount;
}

function ensureWorkloadEmployee(employees: Map<string, EmployeeWorkloadPoint>, id?: string, name?: string) {
  const employee = ensureEmployee(employees, id, name) as EmployeeWorkloadPoint;
  employee.overdueTasks ??= 0;
  employee.appointmentsThisWeek ??= 0;
  return employee;
}

function ensurePerformanceEmployee(employees: Map<string, EmployeePerformanceRow>, id?: string, name?: string) {
  const key = id || name || "unassigned";
  const existing = employees.get(key);
  if (existing) {
    if ((!existing.name || existing.name === key) && name) existing.name = name;
    return existing;
  }
  const next: EmployeePerformanceRow = {
    id: key,
    name: name || (key === "unassigned" ? "Nicht zugewiesen" : key),
    casesTotal: 0,
    activeCases: 0,
    completedCases: 0,
    openTasks: 0,
    overdueTasks: 0,
    completedTasks: 0,
    appointmentsThisWeek: 0,
    hearings: 0,
    visits: 0,
    lettersTotal: 0,
    approvedLetters: 0,
    sentLetters: 0,
    messagesTotal: 0,
    sentMessages: 0,
    failedMessages: 0,
    totalClaimAmount: 0,
    settlementAmounts: 0,
    openClaimAmount: 0,
    activityLogCount: 0,
    communicationActivity: 0,
    calendarLoad: 0,
  };
  employees.set(key, next);
  return next;
}

function ensureEmployeeQualityRow(employees: Map<string, EmployeeQualityRow>, id?: string, name?: string) {
  const key = id || name || "unassigned";
  const existing = employees.get(key);
  if (existing) {
    if ((!existing.name || existing.name === key) && name) existing.name = name;
    return existing;
  }
  const next: EmployeeQualityRow = {
    id: key,
    name: name || (key === "unassigned" ? "Nicht zugewiesen" : key),
    qualityProblemCases: 0,
    ocrCases: 0,
    openReviews: 0,
    pendingChanges: 0,
  };
  employees.set(key, next);
  return next;
}

function mergeEmployeeRows(target: Map<string, EmployeePerformanceRow>, rows: EmployeePerformanceRow[]) {
  for (const row of rows) {
    const employee = ensurePerformanceEmployee(target, row.id, row.name);
    employee.casesTotal += row.casesTotal;
    employee.activeCases += row.activeCases;
    employee.completedCases += row.completedCases;
    employee.openTasks += row.openTasks;
    employee.overdueTasks += row.overdueTasks;
    employee.completedTasks += row.completedTasks;
    employee.appointmentsThisWeek += row.appointmentsThisWeek;
    employee.hearings += row.hearings;
    employee.visits += row.visits;
    employee.lettersTotal += row.lettersTotal;
    employee.approvedLetters += row.approvedLetters;
    employee.sentLetters += row.sentLetters;
    employee.messagesTotal += row.messagesTotal;
    employee.sentMessages += row.sentMessages;
    employee.failedMessages += row.failedMessages;
    employee.totalClaimAmount += row.totalClaimAmount;
    employee.settlementAmounts += row.settlementAmounts;
    employee.openClaimAmount += row.openClaimAmount;
    employee.activityLogCount += row.activityLogCount;
    employee.communicationActivity += row.communicationActivity;
    employee.calendarLoad += row.calendarLoad;
    updateLastActivity(employee, row.lastActivity, undefined, row.lastEditedCaseId, row.lastEditedCaseLabel);
  }
}

function updateLastActivity(employee: EmployeePerformanceRow, value?: string, record?: SavedCaseRecord, caseId = record?.id, caseLabel = record?.tenant || record?.address) {
  const date = parseDate(value);
  if (!date) return;
  const current = parseDate(employee.lastActivity);
  if (!current || date.getTime() > current.getTime()) {
    employee.lastActivity = date.toISOString();
    employee.lastEditedCaseId = caseId;
    employee.lastEditedCaseLabel = caseLabel;
  }
}

function sortEmployeePerformance(rows: EmployeePerformanceRow[]) {
  return rows.sort((a, b) => {
    if (b.activeCases !== a.activeCases) return b.activeCases - a.activeCases;
    if (b.openTasks !== a.openTasks) return b.openTasks - a.openTasks;
    return b.appointmentsThisWeek - a.appointmentsThisWeek;
  });
}

function buildDocumentRiskItems(records: SavedCaseRecord[]): DocumentRiskItem[] {
  const risks: DocumentRiskItem[] = [];

  for (const record of records) {
    const statuses = getRequiredDocumentStatus(record);
    for (const type of requiredDocumentTypes) {
      if (statuses[type] === "fehlt") {
        risks.push(buildRisk(record, `Pflichtdokument fehlt: ${type}`, "high", "missing_document", `missing-${type}`));
      }
    }

    for (const document of record.documents ?? []) {
      if (hasOcrRequiredWarning(document)) risks.push(buildRisk(record, `OCR erforderlich: ${document.fileName}`, "high", "ocr_required", document.id));
      if (document.extractionStatus === "failed") risks.push(buildRisk(record, `Extraktion fehlgeschlagen: ${document.fileName}`, "high", "failed_extraction", document.id));
      if ((document.extractionWarnings?.length ?? 0) > 0) risks.push(buildRisk(record, `Dokumentwarnung: ${document.fileName}`, "medium", "quality_warning", document.id));
    }

    const pendingChanges = record.pendingExtractedChanges?.filter((change) => change.changed).length ?? 0;
    if (pendingChanges > 0) risks.push(buildRisk(record, `${pendingChanges} ungeprüfte erkannte Änderung(en)`, "medium", "pending_changes", "pending-changes"));

    const openReviews = (record.generatedLetters ?? []).filter(isLetterInReview).length;
    if (openReviews > 0) risks.push(buildRisk(record, `${openReviews} Schreiben im Review-Backlog`, "medium", "open_review", "letter-review"));
  }

  return risks.sort((a, b) => riskRank(b.severity) - riskRank(a.severity)).slice(0, 20);
}

function buildRisk(record: SavedCaseRecord, issue: string, severity: DocumentRiskItem["severity"], type: DocumentRiskItem["type"], suffix: string): DocumentRiskItem {
  return {
    id: `${record.id}-${type}-${suffix}`,
    caseId: record.id,
    tenant: record.tenant,
    address: record.address,
    issue,
    severity,
    type,
  };
}

function riskRank(severity: DocumentRiskItem["severity"]) {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function ensureEmployee(employees: Map<string, EmployeeAnalyticsRow>, id?: string, name?: string) {
  const key = id || name || "unassigned";
  const existing = employees.get(key);
  if (existing) {
    if (!existing.name && name) existing.name = name;
    return existing;
  }

  const next = {
    id: key,
    name: name || (key === "unassigned" ? "Nicht zugewiesen" : key),
    cases: 0,
    activeCases: 0,
    openTasks: 0,
    appointments: 0,
    letters: 0,
    communication: 0,
  };
  employees.set(key, next);
  return next;
}

function getMessages(record: SavedCaseRecord): CommunicationMessage[] {
  return (record.communicationThreads ?? []).flatMap((thread) => thread.messages ?? []);
}

function getClaimAmount(record: Pick<SavedCaseRecord, "claimAmount">) {
  return Math.max(Number(record.claimAmount) || 0, 0);
}

function getOpenClaimAmount(record: SavedCaseRecord) {
  return Math.max(Number(record.calculation?.offene_forderung ?? record.claimAmount) || 0, 0);
}

function getSettlementAmount(record: SavedCaseRecord) {
  return Math.max(Number(record.calculation?.vergleichsbetrag ?? record.calculation?.settlementAmount) || 0, 0);
}

function hasOcrUsedWarning(document: SavedCaseDocument) {
  return (document.extractionWarnings ?? []).some((warning) => /ocr\s+wurde\s+verwendet/i.test(warning));
}

function hasOcrRequiredWarning(document: SavedCaseDocument) {
  return (document.extractionWarnings ?? []).some((warning) => /ocr\s*(erforderlich|nötig)|ocr/i.test(warning)) && document.extractionStatus !== "success";
}

function countPendingChanges(records: SavedCaseRecord[]) {
  return records.reduce((count, record) => count + (record.pendingExtractedChanges?.filter((change) => change.changed).length ?? 0), 0);
}

function countExtractedFields(fields?: Record<string, unknown>) {
  if (!fields) return 0;
  return Object.values(fields).filter((value) => {
    if (value === null || value === undefined || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }).length;
}

function buildWarningDistribution(warnings: string[]): DistributionPoint[] {
  const counts = new Map<string, number>();
  for (const warning of warnings) {
    const label = warning.trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ key: label, label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function isLetterInReview(letter: GeneratedLetterVersion) {
  return letter.status === "review" || letter.review?.status === "review_required" || letter.review?.status === "warning" || Boolean(letter.review?.unresolvedPlaceholders?.length);
}

const terminalTaskStatuses = new Set<CaseTask["status"]>(["done", "archived", "dismissed"]);

function letterStatusLabel(status: GeneratedLetterStatus) {
  const labels: Record<GeneratedLetterStatus, string> = {
    draft: "Entwurf",
    generated: "Generiert",
    review: "Prüfung",
    ready: "Bereit",
    sent: "Versendet",
    archived: "Archiviert",
    outdated: "Veraltet",
  };
  return labels[status];
}

function communicationStatusLabel(status: CommunicationMessage["status"]) {
  const labels: Record<CommunicationMessage["status"], string> = {
    draft: "Entwurf",
    ready: "Bereit",
    queued: "Warteschlange",
    sent: "Versendet",
    failed: "Fehlgeschlagen",
    received: "Empfangen",
    archived: "Archiviert",
  };
  return labels[status];
}

function taskPriorityLabel(priority: CaseTaskPriority) {
  const labels: Record<CaseTaskPriority, string> = {
    low: "Niedrig",
    normal: "Normal",
    high: "Hoch",
    urgent: "Dringend",
  };
  return labels[priority];
}

function taskStatusLabel(status: CaseTaskStatus) {
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

function monthKey(value?: string) {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("de-AT", { month: "short", year: "2-digit" }).format(new Date(year, month - 1, 1));
}

function isToday(value?: string) {
  const date = parseDate(value);
  if (!date) return false;
  return date.toDateString() === new Date().toDateString();
}

function average(values: number[]) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (numeric.length === 0) return 0;
  return sum(numeric) / numeric.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function parseDate(value?: Date | string) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isTimestampInRange(value: number | undefined, from: number, to: number) {
  return typeof value === "number" && value >= from && value <= to;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
