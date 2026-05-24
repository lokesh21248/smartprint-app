import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Runtime: must stay Node.js — Supabase admin + storage are NOT Edge-compatible
// ─────────────────────────────────────────────────────────────────────────────
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro max; free tier is 10s

const BUCKET = "temp-uploads";
const BATCH_LIMIT = 50;

/**
 * GET /api/cron/cleanup
 *
 * Vercel Cron always calls GET. Schedule: daily (vercel.json).
 *
 * Strategy (one bounded batch per run — zero risk of Vercel timeout):
 *   - Fetches temporary staging sessions that have expired (is_temporary = true AND expires_at < NOW())
 *   - Deletes their staging files from the temp-uploads bucket
 *   - Marks their status as 'abandoned' in the upload_sessions database table
 *   - Writes a structured row to cleanup_logs for enterprise-grade audit trail
 *
 * Safety guarantees:
 *   - NEVER touches permanent orders, completed order assets, paid files, or order-files bucket
 *   - Always returns HTTP 200 so Vercel Cron does not mark the job as failed
 */
export async function GET(request: Request) {
  const startedAt = new Date();
  const runStart = Date.now();

  // ── 1. Auth — Vercel injects Authorization: Bearer <CRON_SECRET> ────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error("[cleanup] Unauthorized request — wrong or missing CRON_SECRET");
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Env sanity check ─────────────────────────────────────────────────────
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[cleanup] CRITICAL: Missing Supabase env vars — aborting");
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500 }
    );
  }

  const supabase = createAdminClient();
  const errors: string[] = [];
  let deletedCount = 0;
  let reclaimedBytes = 0;

  try {
    // ── 3. Fetch expired temporary staging sessions ───────────────────────────
    const { data: expiredSessions, error: fetchErr } = await supabase
      .from("upload_sessions")
      .select("id, storage_path, file_size")
      .eq("is_temporary", true)
      .lt("expires_at", new Date().toISOString())
      .in("upload_status", ["pending", "uploading", "failed"])
      .limit(BATCH_LIMIT);

    if (fetchErr) {
      throw new Error(`Failed to fetch expired upload sessions: ${fetchErr.message}`);
    }

    const sessions = expiredSessions ?? [];
    console.log(`[cleanup] Found ${sessions.length} expired temporary staging uploads`);

    for (const session of sessions) {
      let storageOk = true;

      // Delete physical file from temp-uploads staging bucket
      if (session.storage_path) {
        try {
          const { error: storErr } = await supabase.storage
            .from(BUCKET)
            .remove([session.storage_path]);

          if (storErr) {
            storageOk = false;
            const msg = `Storage delete failed for path ${session.storage_path}: ${storErr.message}`;
            console.error(`[cleanup] ${msg}`);
            errors.push(msg);
          } else {
            deletedCount++;
            reclaimedBytes += Number(session.file_size || 0);
          }
        } catch (e) {
          storageOk = false;
          const msg = `Storage exception for path ${session.storage_path}: ${e instanceof Error ? e.message : String(e)}`;
          console.error(`[cleanup] ${msg}`);
          errors.push(msg);
        }
      }

      // Mark the upload session as abandoned in database
      if (storageOk) {
        try {
          const { error: dbErr } = await supabase
            .from("upload_sessions")
            .update({
              upload_status: "abandoned",
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.id);

          if (dbErr) {
            const msg = `DB update failed for session ${session.id}: ${dbErr.message}`;
            console.error(`[cleanup] ${msg}`);
            errors.push(msg);
          }
        } catch (e) {
          const msg = `DB exception for session ${session.id}: ${e instanceof Error ? e.message : String(e)}`;
          console.error(`[cleanup] ${msg}`);
          errors.push(msg);
        }
      }
    }
  } catch (e) {
    const msg = `Critical cleanup failure: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[cleanup] ${msg}`);
    errors.push(msg);
  }

  // ── 4. Write to cleanup_logs for monitoring and compliance ────────────────
  const duration_ms = Date.now() - runStart;
  const runStatus = errors.length === 0 ? "SUCCESS" : "PARTIAL_SUCCESS";

  try {
    await supabase.from("cleanup_logs").insert({
      deleted_file_count: deletedCount,
      reclaimed_storage_bytes: reclaimedBytes,
      status: runStatus,
      error_message: errors.length > 0 ? errors.slice(0, 10).join(" | ") : null,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[cleanup] Failed to write cleanup log row:", e instanceof Error ? e.message : String(e));
  }

  const response = {
    success: true,
    status: runStatus,
    deletedCount,
    reclaimedBytes,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
    duration_ms,
    ranAt: new Date().toISOString(),
  };

  console.info("[cleanup] Staging cleanup complete:", JSON.stringify(response));

  // Always HTTP 200 so Vercel Cron reports a completed execution cycle
  return NextResponse.json(response);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — manual trigger (e.g. from admin panel or curl)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  return GET(request);
}
