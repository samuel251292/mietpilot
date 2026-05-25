"use client";

import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/services/supabase";
import type { PublicUser } from "@/lib/auth";
import type { UserRole } from "@/types/case";

export type SupabaseProfile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: UserRole | null;
  status?: string | null;
};

export async function signInWithPassword(email: string, password: string): Promise<PublicUser | null> {
  const client = createBrowserSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;

  return getProfile(data.user);
}

export async function signOut(): Promise<void> {
  const client = createBrowserSupabaseClient();
  if (!client) return;

  await client.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const client = createBrowserSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return data.session;
}

export async function getProfile(user?: SupabaseUser | null): Promise<PublicUser | null> {
  const client = createBrowserSupabaseClient();
  if (!client) return null;

  const resolvedUser = user ?? (await client.auth.getUser()).data.user;
  if (!resolvedUser) return null;

  const { data } = await client
    .from("profiles")
    .select("id,email,full_name,role,status")
    .eq("id", resolvedUser.id)
    .maybeSingle<SupabaseProfile>();

  return mapSupabaseUserToPublicUser(resolvedUser, data ?? undefined);
}

export function mapSupabaseUserToPublicUser(user: SupabaseUser, profile?: SupabaseProfile): PublicUser {
  return {
    id: user.id,
    email: profile?.email ?? user.email ?? "",
    name: profile?.full_name ?? user.user_metadata?.full_name ?? user.email ?? "Nutzer",
    role: profile?.role === "admin" ? "admin" : "employee",
    createdAt: user.created_at ?? new Date().toISOString(),
  };
}

export function canUseSupabaseAuth() {
  return isSupabaseConfigured();
}
