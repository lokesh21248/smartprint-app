import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Lightweight liveness + readiness probe.
 * Used by uptime monitors (BetterUptime, UptimeRobot) and Vercel health checks.
 * Never cached — always reflects real-time system state.
 *
 * L2 FIX: Replaced `SELECT id FROM shops LIMIT 1` with a PostgREST root ping.
 * The old approach reported "degraded" if the shops table was locked by a migration,
 * even when the database itself was healthy. The root endpoint is zero-cost
 * (no table scan, no RLS eval) and only fails if the DB connection itself is broken.
 */
export async function GET() {
  const t0 = Date.now();
  let dbStatus: "ok" | "degraded" = "ok";

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      dbStatus = "degraded";
    } else {
      // PostgREST root endpoint: returns the API schema JSON with a single HTTP round-trip.
      // Cost: ~1ms on a healthy connection, no DB query, no RLS eval.
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { apikey: anonKey, "Cache-Control": "no-store" },
        signal: AbortSignal.timeout(3000), // 3s timeout — health check must be fast
      });
      if (!res.ok) dbStatus = "degraded";
    }
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

