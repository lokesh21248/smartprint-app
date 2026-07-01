import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Lightweight liveness + readiness probe.
 * Used by uptime monitors (BetterUptime, UptimeRobot) and Vercel health checks.
 * Never cached — always reflects real-time system state.
 */
export async function GET() {
  const t0 = Date.now();
  let dbStatus: "ok" | "degraded" = "ok";

  try {
    const { error } = await createAdminClient()
      .from("shops")
      .select("id")
      .limit(1);
    if (error) dbStatus = "degraded";
  } catch {
    dbStatus = "degraded";
  }

  const latencyMs = Date.now() - t0;
  const status = dbStatus === "ok" ? 200 : 503;

  return NextResponse.json(
    {
      status: dbStatus === "ok" ? "ok" : "degraded",
      db: dbStatus,
      latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
