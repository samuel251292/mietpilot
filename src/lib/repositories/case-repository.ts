"use client";

import type { CaseActivity, SavedCaseRecord } from "@/types/case";
import type { PublicUser } from "@/lib/auth";

export type CaseActivityInput = Omit<CaseActivity, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export type CaseSaveOptions = {
  actor?: PublicUser | null;
  activity?: CaseActivityInput | CaseActivityInput[];
  skipAutoActivity?: boolean;
};

export interface CaseRepository {
  list(): SavedCaseRecord[];
  get(id: string): SavedCaseRecord | undefined;
  save(record: SavedCaseRecord, options?: CaseSaveOptions): SavedCaseRecord;
  delete(id: string, actor?: PublicUser | null): void;
  share(caseId: string, userId: string, permission: "read" | "write", actor: PublicUser): SavedCaseRecord | undefined;
  assign(caseId: string, ownerId: string, ownerName: string, actor: PublicUser): SavedCaseRecord | undefined;
  complete(caseId: string, actor?: PublicUser | null): SavedCaseRecord | undefined;
  addActivity(caseId: string, activity: CaseActivityInput): SavedCaseRecord | undefined;
}

export interface AsyncCaseRepository {
  list(): Promise<SavedCaseRecord[]>;
  get(id: string): Promise<SavedCaseRecord | null>;
  save(record: SavedCaseRecord, options?: CaseSaveOptions): Promise<SavedCaseRecord>;
  delete(id: string, actor?: PublicUser | null): Promise<void>;
  share(caseId: string, userId: string, permission: "read" | "write", actor: PublicUser): Promise<SavedCaseRecord | null>;
  assign(caseId: string, ownerId: string, ownerName: string, actor: PublicUser): Promise<SavedCaseRecord | null>;
  complete(caseId: string, actor?: PublicUser | null): Promise<SavedCaseRecord | null>;
  addActivity(caseId: string, activity: CaseActivityInput): Promise<SavedCaseRecord | null>;
}
