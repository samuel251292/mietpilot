import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type SupabaseConfig = {
  url?: string;
  anonKey?: string;
  configured: boolean;
};

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    configured: Boolean(supabaseUrl && supabaseAnonKey),
  };
}

export function isSupabaseConfigured() {
  return getSupabaseConfig().configured;
}

export function createBrowserSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) return null;

  return createClient(config.url, config.anonKey);
}

export function createServerSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) return null;

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSupabaseClient() {
  return createBrowserSupabaseClient();
}
