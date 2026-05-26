"use client";

import type { CaseRecord, SavedCaseRecord, User, UserRole } from "@/types/case";

const currentUserKey = "mietpilot-current-user";

export const demoUsers: User[] = [
  {
    id: "admin",
    name: "Admin",
    email: "admin@hausapp.ch",
    password: "admin123",
    role: "admin",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "mueller",
    name: "Mueller",
    email: "mueller@test.ch",
    password: "mieter123",
    role: "employee",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "lukas",
    name: "Lukas",
    email: "lukas@mietpilot.local",
    password: "lukas123",
    role: "employee",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "sebastian",
    name: "Sebastian",
    email: "sebastian@mietpilot.local",
    password: "sebastian123",
    role: "employee",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

export type PublicUser = Omit<User, "password">;

export const AuthService = {
  login(identifier: string, password: string): PublicUser | null {
    const normalized = identifier.trim().toLowerCase();
    const user = demoUsers.find(
      (item) =>
        item.email.toLowerCase() === normalized ||
        item.name.toLowerCase() === normalized ||
        getDemoLoginAliases(item).includes(normalized),
    );
    if (!user || user.password !== password) return null;

    const publicUser = toPublicUser(user);
    writeCurrentUser(publicUser);
    dispatchAuthChanged();
    return publicUser;
  },

  logout() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(currentUserKey);
    } catch {
      // Browser storage can be unavailable in hardened/private environments.
    }
    dispatchAuthChanged();
  },

  currentUser(): PublicUser | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(currentUserKey);
      return raw ? (JSON.parse(raw) as PublicUser) : null;
    } catch {
      return null;
    }
  },
};

export function roleLabel(role: UserRole) {
  return role === "admin" ? "Admin" : "Mitarbeiter";
}

export function canViewCase(user: PublicUser | null, record: CaseRecord | SavedCaseRecord) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (record.ownerId === user.id) return true;
  return (record.sharedWith ?? []).some((share) => share.userId === user.id);
}

export function canEditCase(user: PublicUser | null, record: CaseRecord | SavedCaseRecord) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (record.ownerId === user.id) return true;
  return (record.sharedWith ?? []).some((share) => share.userId === user.id && share.permission === "write");
}

export function canShareCase(user: PublicUser | null, record: CaseRecord | SavedCaseRecord) {
  if (!user) return false;
  return user.role === "admin" || record.ownerId === user.id;
}

export function visibleCases<T extends CaseRecord | SavedCaseRecord>(user: PublicUser | null, records: T[]) {
  return records.filter((record) => canViewCase(user, record));
}

function toPublicUser(user: User): PublicUser {
  const { password: _password, ...publicUser } = user;
  return publicUser;
}

function getDemoLoginAliases(user: User) {
  if (user.id === "admin") return ["admin", "admin@mietpilot.local"];
  if (user.id === "mueller") return ["mieter", "mueller", "müller"];
  return [user.id];
}

function writeCurrentUser(user: PublicUser) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(currentUserKey, JSON.stringify(user));
  } catch {
    // Keep login failure-free; the guarded route will simply ask for login again if persistence is unavailable.
  }
}

function dispatchAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("mietpilot-auth-changed"));
}
