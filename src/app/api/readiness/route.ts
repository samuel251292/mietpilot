import { getSupabaseReadiness } from "@/lib/deployment/supabase-check";

export const runtime = "nodejs";

export function GET() {
  const readiness = getSupabaseReadiness();

  return Response.json({
    app: "mietpilot",
    environment: process.env.NODE_ENV,
    authProvider: readiness.authProvider,
    caseRepository: readiness.repositoryMode,
    fileStorage: readiness.storageMode,
    supabaseConfigured: readiness.configured,
    health: "ok",
    checks: readiness.checks,
    warnings: readiness.warnings,
    timestamp: new Date().toISOString(),
  });
}
