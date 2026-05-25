export const runtime = "nodejs";

export function GET() {
  return Response.json({
    status: "ok",
    app: "mietpilot",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
}
