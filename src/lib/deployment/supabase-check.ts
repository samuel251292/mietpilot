export type DeploymentModeCheck = {
  mode: string;
  usesSupabase: boolean;
};

export type SupabaseEnvCheck = {
  hasUrl: boolean;
  hasAnonKey: boolean;
  configured: boolean;
};

export type SupabaseReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  warning?: string;
};

export type SupabaseReadiness = {
  configured: boolean;
  authProvider: string;
  repositoryMode: string;
  storageMode: string;
  checks: SupabaseReadinessCheck[];
  warnings: string[];
};

export function checkSupabaseEnv(): SupabaseEnvCheck {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return {
    hasUrl,
    hasAnonKey,
    configured: hasUrl && hasAnonKey,
  };
}

export function checkRepositoryMode(): DeploymentModeCheck {
  const mode = normalizeMode(process.env.NEXT_PUBLIC_CASE_REPOSITORY, "local");

  return {
    mode,
    usesSupabase: mode === "supabase",
  };
}

export function checkStorageMode(): DeploymentModeCheck {
  const mode = normalizeMode(process.env.NEXT_PUBLIC_FILE_STORAGE, "local");

  return {
    mode,
    usesSupabase: mode === "supabase",
  };
}

export function getSupabaseReadiness(): SupabaseReadiness {
  const env = checkSupabaseEnv();
  const repository = checkRepositoryMode();
  const storage = checkStorageMode();
  const authProvider = normalizeMode(process.env.NEXT_PUBLIC_AUTH_PROVIDER, "demo");
  const checks: SupabaseReadinessCheck[] = [
    {
      id: "env",
      label: "Supabase ENV gesetzt",
      ok: env.configured,
      warning: env.configured ? undefined : "NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt.",
    },
    {
      id: "repository",
      label: "Case Repository Modus",
      ok: !repository.usesSupabase || env.configured,
      warning:
        repository.usesSupabase && !env.configured
          ? "Repository steht auf supabase, faellt aber ohne Supabase ENV auf LocalStorage zurueck."
          : undefined,
    },
    {
      id: "storage",
      label: "Datei-Storage Modus",
      ok: !storage.usesSupabase || env.configured,
      warning:
        storage.usesSupabase && !env.configured
          ? "Datei-Storage steht auf supabase, nutzt aber ohne Supabase ENV den DataURL-Fallback."
          : undefined,
    },
    {
      id: "auth",
      label: "Auth Provider",
      ok: authProvider === "demo" || env.configured,
      warning:
        authProvider === "supabase" && !env.configured
          ? "Supabase Auth ist gewaehlt, aber Supabase ENV fehlt."
          : undefined,
    },
  ];

  const warnings = checks.flatMap((check) => (check.warning ? [check.warning] : []));

  if (authProvider === "demo" && (repository.usesSupabase || storage.usesSupabase)) {
    warnings.push("Testmodus: Demo-Auth bleibt aktiv, waehrend Repository/Storage gegen Supabase getestet werden.");
  }

  return {
    configured: env.configured,
    authProvider,
    repositoryMode: repository.mode,
    storageMode: storage.mode,
    checks,
    warnings,
  };
}

function normalizeMode(value: string | undefined, fallback: string) {
  return (value ?? fallback).trim().toLowerCase();
}
