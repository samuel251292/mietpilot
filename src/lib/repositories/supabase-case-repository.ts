"use client";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { CaseActivity, CaseShare, SavedCaseRecord } from "@/types/case";
import type { PublicUser } from "@/lib/auth";
import type { AsyncCaseRepository, CaseActivityInput, CaseRepository, CaseSaveOptions } from "@/lib/repositories/case-repository";
import { buildActivity, ensureActivityLog, formatStoredDate, normalizeRecord } from "@/lib/repositories/local-case-repository";
import { createBrowserSupabaseClient } from "@/services/supabase";

type DbCase = {
  id: string;
  tenant: string | null;
  address: string | null;
  status: SavedCaseRecord["status"] | string | null;
  last_activity: string | null;
  claim_amount: number | string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  extracted: unknown;
  calculation: unknown;
  calculation_report: unknown;
  documents: unknown;
  generated_letters: unknown;
  communication_threads: unknown;
  case_tasks: unknown;
  letter_attachments: unknown;
  metadata: Record<string, unknown> | null;
};

type DbShare = {
  id?: string;
  case_id: string;
  user_id: string;
  permission: "read" | "write";
  created_at?: string;
};

type DbActivity = {
  id: string;
  case_id: string;
  type: string | null;
  title: string;
  description: string | null;
  user_id: string | null;
  user_name: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export const supabaseCaseRepositoryAsync: AsyncCaseRepository = {
  async list() {
    const client = requireSupabaseClient();
    const { data, error } = await client.from("cases").select("*").order("updated_at", { ascending: false });
    throwIfError(error, "Fälle konnten nicht aus Supabase geladen werden.");
    return hydrateCases(client, (data ?? []) as DbCase[]);
  },

  async get(id: string) {
    const client = requireSupabaseClient();
    const { data, error } = await client.from("cases").select("*").eq("id", id).maybeSingle();
    throwIfError(error, "Fall konnte nicht aus Supabase geladen werden.");
    if (!data) return null;
    const [record] = await hydrateCases(client, [data as DbCase]);
    return record;
  },

  async save(record: SavedCaseRecord, options: CaseSaveOptions = {}) {
    const client = requireSupabaseClient();
    const normalized = normalizeRecord(record);
    const row = toCaseRow(normalized, options.actor);
    const { error } = await client.from("cases").upsert(row, { onConflict: "id" });
    throwIfError(error, "Fall konnte nicht in Supabase gespeichert werden.");

    await syncCaseShares(client, normalized);
    await syncActivityLog(client, normalized);
    await insertActivityInputs(client, normalized.id, options.activity);

    const saved = await this.get(normalized.id);
    if (!saved) throw new Error("Fall wurde gespeichert, konnte danach aber nicht aus Supabase geladen werden.");
    return saved;
  },

  async delete(id: string, actor?: PublicUser | null) {
    const client = requireSupabaseClient();
    if (actor) {
      await insertActivityInputs(client, id, buildActivity("deleted", "Fall gelöscht", { actor }));
    }
    const { error } = await client.from("cases").delete().eq("id", id);
    throwIfError(error, "Fall konnte nicht aus Supabase gelöscht werden.");
  },

  async complete(id: string, actor?: PublicUser | null) {
    const current = await this.get(id);
    if (!current) return null;
    const now = new Date().toISOString();
    const next: SavedCaseRecord = {
      ...current,
      status: "Abgeschlossen",
      updatedAt: now,
      updatedBy: toUuidOrUndefined(actor?.id) ?? current.updatedBy,
      lastActivity: formatStoredDate(now),
    };
    return this.save(next, {
      actor,
      activity: buildActivity("completed", "Fall abgeschlossen", { actor }),
    });
  },

  async share(id: string, userId: string, permission: "read" | "write", actor: PublicUser) {
    const client = requireSupabaseClient();
    const current = await this.get(id);
    if (!current) return null;

    const sharedWith = (current.sharedWith ?? []).filter((share) => share.userId !== userId);
    const next: SavedCaseRecord = {
      ...current,
      sharedWith: [...sharedWith, { userId, permission }],
      updatedAt: new Date().toISOString(),
      updatedBy: toUuidOrUndefined(actor.id) ?? current.updatedBy,
    };

    const { error } = await client.from("case_shares").upsert({ case_id: id, user_id: userId, permission }, { onConflict: "case_id,user_id" });
    throwIfError(error, "Fallfreigabe konnte nicht in Supabase gespeichert werden.");

    return this.save(next, {
      actor,
      activity: buildActivity("shared", "Fall geteilt", {
        actor,
        description: `Freigabe ${permission === "write" ? "zum Bearbeiten" : "zum Lesen"} erteilt.`,
        metadata: { userId, permission },
      }),
    });
  },

  async assign(id: string, ownerId: string, ownerName: string, actor: PublicUser) {
    const current = await this.get(id);
    if (!current) return null;
    const now = new Date().toISOString();
    const next: SavedCaseRecord = {
      ...current,
      ownerId,
      ownerName,
      updatedAt: now,
      updatedBy: toUuidOrUndefined(actor.id) ?? current.updatedBy,
      lastActivity: formatStoredDate(now),
    };
    return this.save(next, {
      actor,
      activity: buildActivity("assigned", "Fall zugewiesen", {
        actor,
        description: `Zuständig: ${ownerName}`,
        metadata: { ownerId, ownerName },
      }),
    });
  },

  async addActivity(caseId: string, activity: CaseActivityInput) {
    const client = requireSupabaseClient();
    await insertActivityInputs(client, caseId, activity);
    return this.get(caseId);
  },
};

export const supabaseCaseRepository: CaseRepository = {
  list() {
    return notSyncReady();
  },
  get(_id: string) {
    return notSyncReady();
  },
  save(_record: SavedCaseRecord, _options?: CaseSaveOptions) {
    return notSyncReady();
  },
  delete(_id: string, _actor?: PublicUser | null) {
    notSyncReady();
  },
  share(_caseId: string, _userId: string, _permission: "read" | "write", _actor: PublicUser) {
    return notSyncReady();
  },
  assign(_caseId: string, _ownerId: string, _ownerName: string, _actor: PublicUser) {
    return notSyncReady();
  },
  complete(_caseId: string, _actor?: PublicUser | null) {
    return notSyncReady();
  },
  addActivity(_caseId: string, _activity: CaseActivityInput) {
    return notSyncReady();
  },
};

function notSyncReady(): never {
  throw new Error("SupabaseCaseRepository ist implementiert, aber die bestehende CaseService-Fassade ist noch synchron. Nutze vorerst localCaseRepository oder die async Supabase-Methoden in einer späteren Migrationsphase.");
}

function requireSupabaseClient() {
  const client = createBrowserSupabaseClient();
  if (!client) {
    throw new Error("Supabase ist nicht konfiguriert. Bitte NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY setzen.");
  }
  return client;
}

async function hydrateCases(client: SupabaseClient, rows: DbCase[]) {
  const caseIds = rows.map((row) => row.id);
  if (caseIds.length === 0) return [];

  const { data: shares, error: sharesError } = await client.from("case_shares").select("*").in("case_id", caseIds);
  throwIfError(sharesError, "Fallfreigaben konnten nicht aus Supabase geladen werden.");

  const { data: activities, error: activitiesError } = await client
    .from("case_activities")
    .select("*")
    .in("case_id", caseIds)
    .order("created_at", { ascending: false });
  throwIfError(activitiesError, "Fallaktivitäten konnten nicht aus Supabase geladen werden.");

  return rows.map((row) => fromCaseRow(row, (shares ?? []) as DbShare[], (activities ?? []) as DbActivity[]));
}

function toCaseRow(record: SavedCaseRecord, actor?: PublicUser | null): Partial<DbCase> & { id: string } {
  const metadata = {
    generatedWord: record.generatedWord,
    generatedPdf: record.generatedPdf,
    letterText: record.letterText,
    pendingExtractedChanges: record.pendingExtractedChanges,
    letterReview: record.letterReview,
    calculationReportGeneratedAt: record.calculationReportGeneratedAt,
    calculationReportVersion: record.calculationReportVersion,
    calculationReportLastExportedAt: record.calculationReportLastExportedAt,
    calculationReportDocx: record.calculationReportDocx,
    calculationReportPdf: record.calculationReportPdf,
    calculationReportDocxGeneratedAt: record.calculationReportDocxGeneratedAt,
    calculationReportPdfGeneratedAt: record.calculationReportPdfGeneratedAt,
  };

  return {
    id: record.id,
    tenant: record.tenant,
    address: record.address,
    status: record.status,
    last_activity: record.lastActivity,
    claim_amount: record.claimAmount,
    owner_id: toUuidOrNull(record.ownerId),
    owner_name: record.ownerName ?? null,
    created_by: toUuidOrNull(record.createdBy),
    updated_by: toUuidOrNull(actor?.id ?? record.updatedBy),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    extracted: record.extracted ?? {},
    calculation: record.calculation ?? {},
    calculation_report: record.calculationReport ?? null,
    documents: record.documents ?? [],
    generated_letters: record.generatedLetters ?? [],
    communication_threads: record.communicationThreads ?? [],
    case_tasks: record.caseTasks ?? [],
    letter_attachments: record.letterAttachments ?? [],
    metadata,
  };
}

function fromCaseRow(row: DbCase, shares: DbShare[], activities: DbActivity[]): SavedCaseRecord {
  const metadata = row.metadata ?? {};
  const record: SavedCaseRecord = {
    id: row.id,
    tenant: row.tenant ?? "",
    address: row.address ?? "",
    status: normalizeStatus(row.status),
    lastActivity: row.last_activity ?? "",
    claimAmount: toFiniteNumber(row.claim_amount),
    ownerId: row.owner_id ?? undefined,
    ownerName: row.owner_name ?? undefined,
    sharedWith: shares.filter((share) => share.case_id === row.id).map((share) => ({ userId: share.user_id, permission: share.permission })),
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    extracted: asRecord(row.extracted) as SavedCaseRecord["extracted"],
    calculation: asRecord(row.calculation) as SavedCaseRecord["calculation"],
    calculationReport: (row.calculation_report ?? undefined) as SavedCaseRecord["calculationReport"],
    calculationReportGeneratedAt: stringMeta(metadata.calculationReportGeneratedAt),
    calculationReportVersion: stringMeta(metadata.calculationReportVersion),
    calculationReportLastExportedAt: stringMeta(metadata.calculationReportLastExportedAt),
    documents: asArray(row.documents) as SavedCaseRecord["documents"],
    generatedLetters: asArray(row.generated_letters) as SavedCaseRecord["generatedLetters"],
    letterAttachments: asArray(row.letter_attachments) as SavedCaseRecord["letterAttachments"],
    letterReview: metadata.letterReview as SavedCaseRecord["letterReview"],
    calculationReportDocx: metadata.calculationReportDocx as SavedCaseRecord["calculationReportDocx"],
    calculationReportPdf: metadata.calculationReportPdf as SavedCaseRecord["calculationReportPdf"],
    calculationReportDocxGeneratedAt: stringMeta(metadata.calculationReportDocxGeneratedAt),
    calculationReportPdfGeneratedAt: stringMeta(metadata.calculationReportPdfGeneratedAt),
    letterText: stringMeta(metadata.letterText) ?? "",
    pendingExtractedChanges: asArray(metadata.pendingExtractedChanges) as SavedCaseRecord["pendingExtractedChanges"],
    generatedWord: metadata.generatedWord as SavedCaseRecord["generatedWord"],
    generatedPdf: metadata.generatedPdf as SavedCaseRecord["generatedPdf"],
    communicationThreads: asArray(row.communication_threads) as SavedCaseRecord["communicationThreads"],
    caseTasks: asArray(row.case_tasks) as SavedCaseRecord["caseTasks"],
    activityLog: activities.filter((activity) => activity.case_id === row.id).map(fromActivityRow),
  };

  return ensureActivityLog(normalizeRecord(record));
}

async function syncCaseShares(client: SupabaseClient, record: SavedCaseRecord) {
  const shares = record.sharedWith ?? [];
  const { error: deleteError } = await client.from("case_shares").delete().eq("case_id", record.id);
  throwIfError(deleteError, "Bestehende Fallfreigaben konnten nicht synchronisiert werden.");

  if (shares.length === 0) return;

  const rows = shares.map((share) => ({
    case_id: record.id,
    user_id: share.userId,
    permission: share.permission,
  }));
  const { error } = await client.from("case_shares").insert(rows);
  throwIfError(error, "Fallfreigaben konnten nicht in Supabase gespeichert werden.");
}

async function syncActivityLog(client: SupabaseClient, record: SavedCaseRecord) {
  const activities = record.activityLog ?? [];
  if (activities.length === 0) return;

  const rows = activities.map((activity) => toActivityRow(record.id, activity));
  const { error } = await client.from("case_activities").upsert(rows, { onConflict: "id" });
  throwIfError(error, "Fallaktivitäten konnten nicht in Supabase gespeichert werden.");
}

async function insertActivityInputs(client: SupabaseClient, caseId: string, input?: CaseActivityInput | CaseActivityInput[]) {
  if (!input) return;
  const activities = (Array.isArray(input) ? input : [input]).map((activity) => normalizeActivityInput(activity));
  if (activities.length === 0) return;

  const { error } = await client.from("case_activities").insert(activities.map((activity) => toActivityRow(caseId, activity)));
  throwIfError(error, "Fallaktivität konnte nicht in Supabase gespeichert werden.");
}

function toActivityRow(caseId: string, activity: CaseActivity): DbActivity {
  return {
    id: activity.id,
    case_id: caseId,
    type: activity.type,
    title: activity.title,
    description: activity.description ?? null,
    user_id: toUuidOrNull(activity.userId),
    user_name: activity.userName ?? null,
    created_at: activity.createdAt,
    metadata: activity.metadata ?? {},
  };
}

function fromActivityRow(row: DbActivity): CaseActivity {
  return {
    id: row.id,
    type: row.type as CaseActivity["type"],
    title: row.title,
    description: row.description ?? undefined,
    userId: row.user_id ?? undefined,
    userName: row.user_name ?? undefined,
    createdAt: row.created_at,
    metadata: row.metadata ?? undefined,
  };
}

function normalizeActivityInput(activity: CaseActivityInput): CaseActivity {
  return {
    ...activity,
    id: activity.id ?? createActivityId(),
    createdAt: activity.createdAt ?? new Date().toISOString(),
  };
}

function throwIfError(error: PostgrestError | null, fallback: string) {
  if (error) throw new Error(`${fallback} ${error.message}`);
}

function normalizeStatus(status: string | null | undefined): SavedCaseRecord["status"] {
  const allowed: SavedCaseRecord["status"][] = ["Entwurf", "Dokumente hochgeladen", "Daten geprüft", "Berechnung abgeschlossen", "Schreiben erstellt", "Abgeschlossen"];
  return allowed.includes(status as SavedCaseRecord["status"]) ? (status as SavedCaseRecord["status"]) : "Entwurf";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringMeta(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function toFiniteNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toUuidOrNull(value?: string | null): string | null {
  return isUuid(value) ? String(value) : null;
}

function toUuidOrUndefined(value?: string | null): string | undefined {
  return isUuid(value) ? String(value) : undefined;
}

function isUuid(value?: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function createActivityId() {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
