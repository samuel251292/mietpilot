"use client";

import type { CaseActivity, CaseActivityType, SavedCaseDocument, SavedCaseRecord } from "@/types/case";
import type { PublicUser } from "@/lib/auth";
import type { AsyncCaseRepository, CaseActivityInput, CaseRepository, CaseSaveOptions } from "@/lib/repositories/case-repository";

const storageKey = "mietpilot-cases";

export const localCaseRepository: CaseRepository = {
  list(): SavedCaseRecord[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const records = Array.isArray(parsed) ? (parsed as SavedCaseRecord[]) : [];
      return records.map((record) => ensureActivityLog(normalizeRecord(record)));
    } catch {
      return [];
    }
  },

  get(id: string) {
    return this.list().find((record) => record.id === id);
  },

  save(record: SavedCaseRecord, options: CaseSaveOptions = {}) {
    const records = this.list();
    const previous = records.find((item) => item.id === record.id);
    const withActivities = applyActivities(previous, record, options);
    const next = previous ? records.map((item) => (item.id === record.id ? withActivities : item)) : [withActivities, ...records];
    writeRecords(next);
    return withActivities;
  },

  delete(id: string, actor?: PublicUser | null) {
    const record = this.get(id);
    if (record) {
      this.addActivity(id, buildActivity("deleted", "Fall gelöscht", { actor }));
    }
    const next = this.list().filter((item) => item.id !== id);
    writeRecords(next);
  },

  complete(id: string, actor?: PublicUser | null) {
    const record = this.get(id);
    if (!record) return undefined;

    const now = new Date().toISOString();
    return this.save(
      {
        ...record,
        status: "Abgeschlossen",
        updatedAt: now,
        updatedBy: actor?.id ?? record.updatedBy,
        lastActivity: formatStoredDate(now),
      },
      {
        actor,
        activity: buildActivity("completed", "Fall abgeschlossen", { actor }),
      },
    );
  },

  share(id: string, userId: string, permission: "read" | "write", actor: PublicUser) {
    const record = this.get(id);
    if (!record) return undefined;
    const sharedWith = (record.sharedWith ?? []).filter((share) => share.userId !== userId);
    const now = new Date().toISOString();
    return this.save(
      {
        ...record,
        sharedWith: [...sharedWith, { userId, permission }],
        updatedAt: now,
        updatedBy: actor.id,
        lastActivity: formatStoredDate(now),
      },
      {
        actor,
        activity: buildActivity("shared", "Fall geteilt", {
          actor,
          description: `Freigabe ${permission === "write" ? "zum Bearbeiten" : "zum Lesen"} erteilt.`,
          metadata: { userId, permission },
        }),
      },
    );
  },

  assign(id: string, ownerId: string, ownerName: string, actor: PublicUser) {
    const record = this.get(id);
    if (!record) return undefined;
    const now = new Date().toISOString();
    return this.save(
      {
        ...record,
        ownerId,
        ownerName,
        updatedAt: now,
        updatedBy: actor.id,
        lastActivity: formatStoredDate(now),
      },
      {
        actor,
        activity: buildActivity("assigned", "Fall zugewiesen", {
          actor,
          description: `Zuständig: ${ownerName}`,
          metadata: { ownerId, ownerName },
        }),
      },
    );
  },

  addActivity(caseId: string, activity: CaseActivityInput) {
    const records = this.list();
    const record = records.find((item) => item.id === caseId);
    if (!record) return undefined;
    const nextRecord = {
      ...record,
      activityLog: [normalizeActivity(activity), ...(record.activityLog ?? [])],
    };
    const next = records.map((item) => (item.id === caseId ? nextRecord : item));
    writeRecords(next);
    return nextRecord;
  },
};

export const localCaseRepositoryAsync: AsyncCaseRepository = {
  async list() {
    return localCaseRepository.list();
  },
  async get(id: string) {
    return localCaseRepository.get(id) ?? null;
  },
  async save(record: SavedCaseRecord, options: CaseSaveOptions = {}) {
    return localCaseRepository.save(record, options);
  },
  async delete(id: string, actor?: PublicUser | null) {
    localCaseRepository.delete(id, actor);
  },
  async share(caseId: string, userId: string, permission: "read" | "write", actor: PublicUser) {
    return localCaseRepository.share(caseId, userId, permission, actor) ?? null;
  },
  async assign(caseId: string, ownerId: string, ownerName: string, actor: PublicUser) {
    return localCaseRepository.assign(caseId, ownerId, ownerName, actor) ?? null;
  },
  async complete(caseId: string, actor?: PublicUser | null) {
    return localCaseRepository.complete(caseId, actor) ?? null;
  },
  async addActivity(caseId: string, activity: CaseActivityInput) {
    return localCaseRepository.addActivity(caseId, activity) ?? null;
  },
};

export function buildActivity(
  type: CaseActivityType,
  title: string,
  options: {
    actor?: PublicUser | null;
    description?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  } = {},
): CaseActivityInput {
  return {
    type,
    title,
    description: options.description,
    userId: options.actor?.id,
    userName: options.actor?.name,
    createdAt: options.createdAt,
    metadata: options.metadata,
  };
}

export function ensureActivityLog(record: SavedCaseRecord): SavedCaseRecord {
  if (Array.isArray(record.activityLog) && record.activityLog.length > 0) {
    return { ...record, activityLog: record.activityLog.map(normalizeActivity) };
  }

  return {
    ...record,
    activityLog: deriveActivities(record),
  };
}

export function normalizeRecord(record: SavedCaseRecord): SavedCaseRecord {
  const fallbackDate = record.updatedAt || record.createdAt || new Date().toISOString();

  return {
    ...record,
    documents: (record.documents ?? []).map((document, index) => normalizeDocument(document, record.id, fallbackDate, index)),
  };
}

export function formatStoredDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function writeRecords(records: SavedCaseRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(records));
  window.dispatchEvent(new Event("mietpilot-cases-changed"));
}

function applyActivities(previous: SavedCaseRecord | undefined, record: SavedCaseRecord, options: CaseSaveOptions) {
  const normalizedRecord = normalizeRecord(record);
  const recordWithExistingLog = previous && !normalizedRecord.activityLog ? { ...normalizedRecord, activityLog: previous.activityLog } : normalizedRecord;
  const base = previous ? ensureActivityLog(recordWithExistingLog) : { ...normalizedRecord, activityLog: normalizedRecord.activityLog ?? [] };
  const activities = [
    ...normalizeActivityInputs(options.activity),
    ...(options.skipAutoActivity ? [] : getAutomaticActivities(previous, base, options.actor)),
  ];

  if (activities.length === 0) return base;

  return {
    ...base,
    activityLog: [...activities, ...(base.activityLog ?? [])],
  };
}

function normalizeDocument(document: SavedCaseDocument, caseId: string, fallbackDate: string, index: number): SavedCaseDocument {
  const uploadedAt = document.uploadedAt || fallbackDate;
  const source = document.source ?? (document.dataUrl ? "upload" : "legacy");

  return {
    ...document,
    id: document.id || createStableDocumentId(caseId, document.type, document.fileName, uploadedAt, index),
    uploadedAt,
    source,
    extractionStatus: document.extractionStatus ?? (source === "legacy" || document.type === "Weitere Dokumente" ? "not_applicable" : undefined),
  };
}

function createStableDocumentId(caseId: string, type: string, fileName: string, uploadedAt: string, index: number) {
  const raw = `${caseId}-${type}-${fileName}-${uploadedAt}-${index}`;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return `doc_${slug || `${Date.now()}_${index}`}`;
}

function getAutomaticActivities(previous: SavedCaseRecord | undefined, record: SavedCaseRecord, actor?: PublicUser | null) {
  if (!previous) {
    return [normalizeActivity(buildActivity("created", "Fall erstellt", { actor, createdAt: record.createdAt }))];
  }

  const activities: CaseActivity[] = [];
  const previousDocuments = previous.documents ?? [];
  const nextDocuments = record.documents ?? [];

  for (const document of nextDocuments) {
    const old = previousDocuments.find((item) => item.type === document.type);
    if (!old) {
      activities.push(normalizeActivity(buildActivity("document_uploaded", `${document.type} hochgeladen`, { actor, metadata: { fileName: document.fileName, type: document.type } })));
    } else if (old.fileName !== document.fileName) {
      activities.push(normalizeActivity(buildActivity("document_replaced", `${document.type} ersetzt`, { actor, description: document.fileName, metadata: { previousFileName: old.fileName, fileName: document.fileName, type: document.type } })));
    }
  }

  for (const document of previousDocuments) {
    if (!nextDocuments.some((item) => item.type === document.type)) {
      activities.push(normalizeActivity(buildActivity("document_removed", `${document.type} entfernt`, { actor, metadata: { fileName: document.fileName, type: document.type } })));
    }
  }

  if (calculationChanged(previous, record)) {
    activities.push(normalizeActivity(buildActivity("calculation_updated", "Berechnung aktualisiert", { actor })));
  }

  if (previous.letterText !== record.letterText) {
    activities.push(normalizeActivity(buildActivity("letter_generated", "Vergleichsschreiben aktualisiert", { actor })));
  }

  if (previous.generatedWord?.generatedAt !== record.generatedWord?.generatedAt) {
    activities.push(normalizeActivity(buildActivity("letter_generated", "Vergleichsschreiben generiert", { actor, metadata: { fileName: record.generatedWord?.fileName } })));
  }

  if (previous.generatedPdf?.generatedAt !== record.generatedPdf?.generatedAt) {
    activities.push(normalizeActivity(buildActivity("export_generated", "PDF exportiert", { actor, metadata: { fileName: record.generatedPdf?.fileName } })));
  }

  if (activities.length === 0 && previous.updatedAt !== record.updatedAt) {
    activities.push(normalizeActivity(buildActivity("updated", "Fall bearbeitet", { actor })));
  }

  return activities;
}

function deriveActivities(record: SavedCaseRecord) {
  const activities: CaseActivity[] = [
    normalizeActivity(buildActivity("created", "Fall erstellt", { createdAt: record.createdAt, metadata: { derived: true } })),
  ];

  if (record.updatedAt && record.updatedAt !== record.createdAt) {
    activities.push(normalizeActivity(buildActivity("updated", "Zuletzt geändert", { createdAt: record.updatedAt, metadata: { derived: true } })));
  }

  if (record.documents.length > 0) {
    activities.push(normalizeActivity(buildActivity("document_uploaded", "Dokumente vorhanden", { createdAt: record.updatedAt, description: `${record.documents.length} Dokument(e) gespeichert`, metadata: { derived: true } })));
  }

  if (record.generatedWord?.generatedAt) {
    activities.push(normalizeActivity(buildActivity("letter_generated", "Vergleichsschreiben vorhanden", { createdAt: record.generatedWord.generatedAt, metadata: { derived: true, fileName: record.generatedWord.fileName } })));
  }

  if (record.generatedPdf?.generatedAt) {
    activities.push(normalizeActivity(buildActivity("export_generated", "PDF vorhanden", { createdAt: record.generatedPdf.generatedAt, metadata: { derived: true, fileName: record.generatedPdf.fileName } })));
  }

  if (record.status === "Abgeschlossen") {
    activities.push(normalizeActivity(buildActivity("completed", "Fall abgeschlossen", { createdAt: record.updatedAt, metadata: { derived: true } })));
  }

  return sortActivities(activities);
}

function normalizeActivityInputs(input?: CaseActivityInput | CaseActivityInput[]) {
  if (!input) return [];
  return (Array.isArray(input) ? input : [input]).map(normalizeActivity);
}

function normalizeActivity(activity: CaseActivityInput | CaseActivity): CaseActivity {
  return {
    ...activity,
    id: activity.id ?? createActivityId(),
    createdAt: activity.createdAt ?? new Date().toISOString(),
  };
}

function createActivityId() {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sortActivities(activities: CaseActivity[]) {
  return activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function calculationChanged(previous: SavedCaseRecord, record: SavedCaseRecord) {
  return JSON.stringify(previous.calculation) !== JSON.stringify(record.calculation);
}
