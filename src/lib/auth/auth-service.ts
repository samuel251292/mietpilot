"use client";

import { AuthService as DemoAuthService, type PublicUser } from "@/lib/auth";
import type { UserRole } from "@/types/case";

export type AuthProviderName = "demo" | "supabase";

export type AppUser = PublicUser;

export type AuthSession = {
  provider: AuthProviderName;
  user: AppUser | null;
  expiresAt?: string;
  raw?: unknown;
};

export type UserProfile = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status?: string;
};

export interface AppAuthService {
  getCurrentUser(): Promise<AppUser | null>;
  signIn(email: string, password: string): Promise<AppUser | null>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  isAuthenticated(): Promise<boolean>;
  getUserProfile(): Promise<UserProfile | null>;
}

const authProvider = resolveAuthProvider();

export const AppAuthService: AppAuthService = {
  async getCurrentUser() {
    if (authProvider === "supabase") {
      const supabaseAuth = await loadSupabaseAuthProvider();
      if (supabaseAuth.canUseSupabaseAuth()) return supabaseAuth.getProfile();
    }
    return DemoAuthService.currentUser();
  },

  async signIn(email: string, password: string) {
    if (authProvider === "supabase") {
      const supabaseAuth = await loadSupabaseAuthProvider();
      if (supabaseAuth.canUseSupabaseAuth()) return supabaseAuth.signInWithPassword(email, password);
    }
    return DemoAuthService.login(email, password);
  },

  async signOut() {
    if (authProvider === "supabase") {
      const supabaseAuth = await loadSupabaseAuthProvider();
      if (supabaseAuth.canUseSupabaseAuth()) {
        await supabaseAuth.signOut();
        dispatchAuthChanged();
        return;
      }
    }
    DemoAuthService.logout();
  },

  async getSession() {
    if (authProvider === "supabase") {
      const supabaseAuth = await loadSupabaseAuthProvider();
      if (supabaseAuth.canUseSupabaseAuth()) {
        const session = await supabaseAuth.getSession();
        const user = session?.user ? await supabaseAuth.getProfile(session.user) : null;
        return {
          provider: "supabase",
          user,
          expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
          raw: session,
        };
      }
    }

    return {
      provider: "demo",
      user: DemoAuthService.currentUser(),
    };
  },

  async isAuthenticated() {
    return Boolean(await this.getCurrentUser());
  },

  async getUserProfile() {
    const user = await this.getCurrentUser();
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: "active",
    };
  },
};

export function getActiveAuthProvider(): AuthProviderName {
  return authProvider;
}

function resolveAuthProvider(): AuthProviderName {
  const configured = (process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? process.env.AUTH_PROVIDER ?? "demo").trim().toLowerCase();
  if (configured === "supabase") return "supabase";
  return "demo";
}

async function loadSupabaseAuthProvider() {
  return import("@/lib/auth/supabase-auth-provider");
}

function dispatchAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("mietpilot-auth-changed"));
}
