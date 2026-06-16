import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { validateApiAccess, logAdminAction } from "@/lib/auth/role-guard";

export async function GET() {
  const { authorized, response, userId } = await validateApiAccess(["admin"]);
  if (!authorized) return response;

  logAdminAction({ userId: userId!, action: "view_metrics" });

  const supabase = createAdminClient();

  // 🔴 C1 FIX: Replaced 3 queries (2 on webhook_jobs + full JS aggregation loop)
  // with 1 RPC aggregation + 1 parallel log fetch.
  // Requires the get_webhook_job_counts() function in Supabase (see SQL below).
  const [countResult, logs] = await Promise.all([
    supabase.rpc("get_webhook_job_counts"),
    supabase
      .from("job_logs")
      .select("id, action, created_at, user_id, metadata") // precise cols — no select("*")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    summary: countResult.data ?? {},
    recent_logs: logs.data,
  });
}

/*
 * ─── ONE-TIME SQL: run once in Supabase SQL Editor ────────────────────────────
 *
 * CREATE OR REPLACE FUNCTION get_webhook_job_counts()
 * RETURNS jsonb
 * LANGUAGE sql STABLE
 * AS $$
 *   SELECT jsonb_object_agg(status, cnt)
 *   FROM (
 *     SELECT status, COUNT(*) AS cnt
 *     FROM webhook_jobs
 *     GROUP BY status
 *   ) t;
 * $$;
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
