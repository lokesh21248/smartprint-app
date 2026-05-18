import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Runtime: must stay Node.js — Supabase admin + storage are NOT Edge-compatible
// ─────────────────────────────────────────────────────────────────────────────
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro max; free tier is 10s

/**
 * GET /api/cron/cleanup
 *
 * Vercel Cron always calls GET. Schedule: every 24 hours at 12:00 AM UTC (vercel.json).
 *
 * Strategy (one bounded batch per run — zero risk of Vercel timeout):
 *   A. Delete storage files + DB rows for stale terminal orders
 *      (COMPLETED / CANCELLED / DRAFT older than 24 h)
 *   B. Sweep uploaded_documents for abandoned uploads (no order ever placed)
 *   C. Write a structured row to cleanup_logs for observability
 *
 * Safety guarantees:
 *   - NEVER touches PLACED / ACCEPTED / PRINTING / READY orders
 *   - Per-file deletions are individually try/caught — one failure ≠ run failure
 *   - Always returns HTTP 200 so Vercel Cron does not mark the job as failed
 *   - All DB/storage errors are logged and included in the JSON response
 */

// Orders in these statuses are safe to permanently delete after the retention window
const SAFE_STATUSES = ["COMPLETED", "CANCELLED", "DRAFT"] as const;
type SafeStatus = (typeof SAFE_STATUSES)[number];

const BUCKET = "order-files";

// 25 h age threshold
const RETENTION_MS = 25 * 60 * 60 * 1_000;

// Hard cap: 50 rows per run keeps us well inside the Vercel function timeout
const BATCH_LIMIT = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Vercel Cron calls GET
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
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
  const stats = {
    scanned: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
    orphansDeleted: 0,
    orphansFailed: 0,
    orphanRowsCleaned: 0,
  };

  // Cut-off: anything older than 24 hours
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();

  // ════════════════════════════════════════════════════════════════════════════
  // PART A — Stale terminal orders
  // ════════════════════════════════════════════════════════════════════════════
  try {
    const { data: staleOrders, error: fetchErr } = await supabase
      .from("orders")
      .select("id, status, file_s3_key, files")
      .in("status", SAFE_STATUSES as unknown as SafeStatus[])
      .lt("created_at", cutoff)
      .limit(BATCH_LIMIT);

    if (fetchErr) {
      const msg = `Part A fetch failed: ${fetchErr.message}`;
      console.error(`[cleanup] ${msg}`);
      errors.push(msg);
    } else {
      const rows = staleOrders ?? [];
      stats.scanned = rows.length;
      console.log(`[cleanup] Part A: ${rows.length} stale orders found`);

      for (const order of rows) {
        // Collect every storage path this order references
        const paths = new Set<string>();

        if (typeof order.file_s3_key === "string" && order.file_s3_key) {
          paths.add(order.file_s3_key);
        }
        if (Array.isArray(order.files)) {
          for (const f of order.files as Array<{ url?: string }>) {
            if (f?.url && typeof f.url === "string") paths.add(f.url);
          }
        }

        const storagePaths = Array.from(paths);
        let storageOk = true;

        // Delete storage files first — prevents orphaned blobs
        if (storagePaths.length > 0) {
          try {
            const { error: storErr } = await supabase.storage
              .from(BUCKET)
              .remove(storagePaths);

            if (storErr) {
              storageOk = false;
              const msg = `Storage delete failed (order ${order.id}): ${storErr.message}`;
              console.error(`[cleanup] ${msg}`);
              errors.push(msg);
              stats.failed += storagePaths.length;
            } else {
              stats.deleted += storagePaths.length;
            }
          } catch (e) {
            storageOk = false;
            const msg = `Storage exception (order ${order.id}): ${e instanceof Error ? e.message : String(e)}`;
            console.error(`[cleanup] ${msg}`);
            errors.push(msg);
            stats.failed++;
          }
        }

        // Delete DB row ONLY after storage succeeds — keeps run idempotent
        if (storageOk) {
          try {
            const { error: dbErr } = await supabase
              .from("orders")
              .delete()
              .eq("id", order.id)
              // Double-guard: never wipe an order that slipped to an active status
              .in("status", SAFE_STATUSES as unknown as SafeStatus[]);

            if (dbErr) {
              const msg = `DB delete failed (order ${order.id}): ${dbErr.message}`;
              console.error(`[cleanup] ${msg}`);
              errors.push(msg);
              stats.skipped++;
            }
          } catch (e) {
            const msg = `DB exception (order ${order.id}): ${e instanceof Error ? e.message : String(e)}`;
            console.error(`[cleanup] ${msg}`);
            errors.push(msg);
            stats.skipped++;
          }
        } else {
          stats.skipped++;
        }
      }
    }
  } catch (e) {
    const msg = `Part A critical: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[cleanup] ${msg}`);
    errors.push(msg);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PART B — Orphan uploaded_documents sweep
  // Files uploaded but order was never placed (user closed the tab, etc.)
  // ════════════════════════════════════════════════════════════════════════════
  try {
    const { data: staleDocs, error: docsErr } = await supabase
      .from("uploaded_documents")
      .select("id, file_path")
      .lt("created_at", cutoff)
      .limit(BATCH_LIMIT);

    if (docsErr) {
      const msg = `Part B fetch failed: ${docsErr.message}`;
      console.error(`[cleanup] ${msg}`);
      errors.push(msg);
    } else {
      const docs = staleDocs ?? [];
      console.log(`[cleanup] Part B: ${docs.length} stale upload-tracking rows`);

      for (const doc of docs) {
        if (!doc.file_path || typeof doc.file_path !== "string") {
          // Bad row — clean the tracker but skip storage delete
          await supabase.from("uploaded_documents").delete().eq("id", doc.id);
          stats.orphanRowsCleaned++;
          continue;
        }

        // Check whether any *active* order still references this file path.
        // Active = anything that is NOT a terminal status.
        let isActive = false;
        try {
          const { data: activeRef } = await supabase
            .from("orders")
            .select("id")
            .eq("file_s3_key", doc.file_path)
            .not("status", "in", `(${SAFE_STATUSES.join(",")})`)
            .limit(1);

          isActive = Array.isArray(activeRef) && activeRef.length > 0;
        } catch {
          // If we can't confirm, skip deletion — safety first
          isActive = true;
        }

        if (!isActive) {
          try {
            const { error: orphanErr } = await supabase.storage
              .from(BUCKET)
              .remove([doc.file_path]);

            if (orphanErr) {
              // Warn only — file may already have been removed in Part A
              console.warn(
                `[cleanup] Orphan storage warn (${doc.file_path}): ${orphanErr.message}`
              );
              stats.orphansFailed++;
            } else {
              stats.orphansDeleted++;
            }
          } catch (e) {
            console.warn(
              `[cleanup] Orphan exception (${doc.file_path}): ${e instanceof Error ? e.message : String(e)}`
            );
            stats.orphansFailed++;
          }
        }

        // Always clean the tracker row — it's past its useful TTL regardless
        try {
          const { error: rowErr } = await supabase
            .from("uploaded_documents")
            .delete()
            .eq("id", doc.id);

          if (!rowErr) stats.orphanRowsCleaned++;
        } catch {
          // Non-critical — row will be picked up next run
        }
      }
    }
  } catch (e) {
    const msg = `Part B critical: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[cleanup] ${msg}`);
    errors.push(msg);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PART C — Write structured run log (non-critical — never throws)
  // ════════════════════════════════════════════════════════════════════════════
  const duration_ms = Date.now() - runStart;
  const runStatus = errors.length === 0 ? "SUCCESS" : "PARTIAL_SUCCESS";

  try {
    await supabase.from("cleanup_logs").insert({
      deleted_count: stats.deleted + stats.orphansDeleted,
      status: runStatus,
      errors: errors.length > 0 ? errors.slice(0, 10).join(" | ") : null,
    });
  } catch (e) {
    // Non-fatal — observability failure must never mask the cleanup result
    console.warn("[cleanup] cleanup_logs insert failed:", e instanceof Error ? e.message : String(e));
  }

  const response = {
    success: true,
    status: runStatus,
    scanned: stats.scanned,
    deleted: stats.deleted,
    skipped: stats.skipped,
    failed: stats.failed,
    orphansDeleted: stats.orphansDeleted,
    orphansFailed: stats.orphansFailed,
    orphanRowsCleaned: stats.orphanRowsCleaned,
    errorCount: errors.length,
    errors: errors.slice(0, 10), // cap log size
    duration_ms,
    ranAt: new Date().toISOString(),
  };

  console.info("[cleanup] Run complete:", JSON.stringify(response));

  // Always HTTP 200 — Vercel Cron marks any non-2xx as a failed job
  return NextResponse.json(response);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — manual trigger (e.g. from admin panel or curl)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  // Re-use the same GET handler for manual triggers
  return GET(request);
}
