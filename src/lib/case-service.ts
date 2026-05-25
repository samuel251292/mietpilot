"use client";

import type { CaseActivityType } from "@/types/case";
import type { PublicUser } from "@/lib/auth";
import type { AsyncCaseRepository, CaseActivityInput, CaseSaveOptions } from "@/lib/repositories/case-repository";
import {
  buildActivity,
  ensureActivityLog,
  formatStoredDate,
  localCaseRepository,
  localCaseRepositoryAsync,
  normalizeRecord,
} from "@/lib/repositories/local-case-repository";
import { supabaseCaseRepositoryAsync } from "@/lib/repositories/supabase-case-repository";
import { isSupabaseConfigured } from "@/services/supabase";

const activeCaseRepository = resolveActiveCaseRepository();

export const CaseService = {
  list: activeCaseRepository.list.bind(activeCaseRepository),
  get: activeCaseRepository.get.bind(activeCaseRepository),
  save: activeCaseRepository.save.bind(activeCaseRepository),
  delete: activeCaseRepository.delete.bind(activeCaseRepository),
  complete: activeCaseRepository.complete.bind(activeCaseRepository),
  share: activeCaseRepository.share.bind(activeCaseRepository),
  assign: activeCaseRepository.assign.bind(activeCaseRepository),
  addActivity: activeCaseRepository.addActivity.bind(activeCaseRepository),
  buildActivity,
  ensureActivityLog,

  createId() {
    const year = new Date().getFullYear();
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `F-${year}-${suffix}`;
  },
};

export const CaseServiceAsync = {
  list: () => getActiveAsyncCaseRepository().list(),
  get: (id: string) => getActiveAsyncCaseRepository().get(id),
  save: (...args: Parameters<AsyncCaseRepository["save"]>) => getActiveAsyncCaseRepository().save(...args),
  delete: (...args: Parameters<AsyncCaseRepository["delete"]>) => getActiveAsyncCaseRepository().delete(...args),
  complete: (...args: Parameters<AsyncCaseRepository["complete"]>) => getActiveAsyncCaseRepository().complete(...args),
  share: (...args: Parameters<AsyncCaseRepository["share"]>) => getActiveAsyncCaseRepository().share(...args),
  assign: (...args: Parameters<AsyncCaseRepository["assign"]>) => getActiveAsyncCaseRepository().assign(...args),
  addActivity: (...args: Parameters<AsyncCaseRepository["addActivity"]>) => getActiveAsyncCaseRepository().addActivity(...args),
  buildActivity,
  ensureActivityLog,

  createId() {
    return CaseService.createId();
  },
};

export { buildActivity, ensureActivityLog, formatStoredDate, normalizeRecord };
export type { CaseActivityInput, CaseSaveOptions };
export type ActivityInput = CaseActivityInput;
export type SaveOptions = CaseSaveOptions;
export type { CaseActivityType, PublicUser };

function resolveActiveCaseRepository() {
  const configuredRepository = (process.env.NEXT_PUBLIC_CASE_REPOSITORY ?? "local").toLowerCase();
  if (configuredRepository !== "supabase") return localCaseRepository;

  if (!isSupabaseConfigured()) {
    warnOnce("NEXT_PUBLIC_CASE_REPOSITORY=supabase gesetzt, aber Supabase ist nicht konfiguriert. CaseService nutzt LocalStorage-Fallback.");
    return localCaseRepository;
  }

  warnOnce("Supabase Case Repository ist vorbereitet, aber CaseService bleibt in Phase 11.4 synchron. LocalStorage-Fallback bleibt aktiv bis zur async Service-Migration.");
  return localCaseRepository;
}

export function getActiveAsyncCaseRepository(): AsyncCaseRepository {
  const configuredRepository = (process.env.NEXT_PUBLIC_CASE_REPOSITORY ?? "local").toLowerCase();
  if (configuredRepository !== "supabase") return localCaseRepositoryAsync;

  if (!isSupabaseConfigured()) {
    warnOnce("NEXT_PUBLIC_CASE_REPOSITORY=supabase gesetzt, aber Supabase ist nicht konfiguriert. CaseServiceAsync nutzt LocalStorage-Fallback.");
    return localCaseRepositoryAsync;
  }

  return supabaseCaseRepositoryAsync;
}

let warned = false;

function warnOnce(message: string) {
  if (warned || typeof console === "undefined") return;
  warned = true;
  console.warn(message);
}
