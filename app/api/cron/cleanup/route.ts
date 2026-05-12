import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/cron/cleanup
 *
 * Enterprise-grade auto-cleanup for SmartPrint — runs every 2 hours via Vercel Cron.
 *
 * Strategy:
 *   1. Fetch stale orders (COMPLETED / CANCELLED / REJECTED / DRAFT older than 2 hours)
 *   2. Delete their storage files FIRST to avoid orphans
 *   3. Delete DB rows ONLY after storage succeeds (retry-safe)
 *   4. Sweep uploaded_documents tracker for abandoned uploads (no order ever created)
 *   5. Write a structured row to cleanup_logs for observability
 *   6. Return detailed JSON so Vercel logs are readable at a glance
 *
 * Auth: Vercel Cron sends  Authorization: Bearer <CRON_SECRET>
 * Protected: never touches PLACED / ACCEPTED / PRINTING / READY orders.
 */

// Statuses that are safe to permanently delete after the retention window
const SAFE_STATUSES = ["COMPLETED", "CANCELLED", "REJECTED", "DRAFT"] as const;
const BUCKET = "order-files";
const RETENTION_MS = 2 * 60 * 60 * 1000; // 2 hours
const BATCH_LIMIT = 100; // max rows per run — keeps us well inside Vercel timeout

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const runStart = Date.now();

  // ── 1. Environment validation ───────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("[cleanup] CRITICAL: Missing Supabase env vars — aborting run");
    return NextResponse.json(
      { success: false, error: "Server misconfigured: missing env vars" },
      { status: 500 }
    );
  }

  // ── 2. Vercel Cron authentication ───────────────────────────────────────────
  const cronSecret  = process.env.CRON_SECRET;
  const authHeader  = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error("[cleanup] Unauthorized request — missing or wrong CRON_SECRET");
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── 3. Shared state for this run ────────────────────────────────────────────
  const supabase = createAdminClient();
  const errors: string[] = [];
  const stats = {
    ordersScanned: 0,
    filesDeleted: 0,
    filesFailed: 0,
    ordersDeleted: 0,
    ordersFailed: 0,
    orphansDeleted: 0,
    orphansFailed: 0,
    orphanRowsCleaned: 0,
  };

  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // PART A — Clean up stale orders and their associated storage files
    // ══════════════════════════════════════════════════════════════════════════

    const { data: staleOrders, error: fetchErr } = await supabase
      .from("orders")
      .select("id, status, file_s3_key, files")
      .in("status", SAFE_STATUSES)
      .lt("created_at", cutoff)
      .limit(BATCH_LIMIT);

    if (fetchErr) {
      // Non-recoverable for this run — log and abort Part A
      const msg = `[cleanup] Part A fetch failed: ${fetchErr.message}`;
      console.error(msg);
      errors.push(msg);
    } else {
      stats.ordersScanned = staleOrders?.length ?? 0;
      console.log(`[cleanup] Part A: found ${stats.ordersScanned} stale orders`);

      for (const order of staleOrders ?? []) {
        // ── Collect every file path attached to this order ──────────────────
        const paths = new Set<string>();
        if (order.file_s3_key) paths.add(order.file_s3_key);

        if (Array.isArray(order.files)) {
          for (const f of order.files as Array<{ url?: string }>) {
            if (f?.url) paths.add(f.url);
          }
        }

        const storagePaths = [...paths];
        let storageOk = true; // tracks whether it's safe to delete the DB row

        // ── Delete storage files FIRST ──────────────────────────────────────
        if (storagePaths.length > 0) {
          const { error: storErr } = await supabase.storage
            .from(BUCKET)
            .remove(storagePaths);

          if (storErr) {
            storageOk = false;
            const msg = `Storage delete failed (order ${order.id}): ${storErr.message}`;
            console.error(`[cleanup] ${msg}`);
            errors.push(msg);
            stats.filesFailed += storagePaths.length;
          } else {
            stats.filesDeleted += storagePaths.length;
            console.log(`[cleanup] Deleted ${storagePaths.length} file(s) for order ${order.id}`);
          }
        }

        // ── Delete DB row ONLY if storage succeeded (retry-safe) ────────────
        if (storageOk) {
          const { error: dbErr } = await supabase
            .from("orders")
            .delete()
            .eq("id", order.id)
            // Double-guard: never wipe active orders even if they slip through
            .in("status", SAFE_STATUSES);

          if (dbErr) {
            const msg = `DB delete failed (order ${order.id}): ${dbErr.message}`;
            console.error(`[cleanup] ${msg}`);
            errors.push(msg);
            stats.ordersFailed++;
          } else {
            stats.ordersDeleted++;
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PART B — Orphan file sweep via uploaded_documents tracker
    // Files that were uploaded but the user closed the tab before placing an order.
    // ══════════════════════════════════════════════════════════════════════════

    const { data: staleDocs, error: docsErr } = await supabase
      .from("uploaded_documents")
      .select("id, file_path")
      .lt("created_at", cutoff)
      .limit(BATCH_LIMIT);

    if (docsErr) {
      const msg = `[cleanup] Part B fetch failed: ${docsErr.message}`;
      console.error(msg);
      errors.push(msg);
    } else if (staleDocs && staleDocs.length > 0) {
      console.log(`[cleanup] Part B: found ${staleDocs.length} stale upload tracking rows`);

      for (const doc of staleDocs) {
        if (!doc.file_path) continue;

        // Check whether any active order still references this file path
        const { data: activeRef } = await supabase
          .from("orders")
          .select("id")
          .eq("file_s3_key", doc.file_path)
          .not("status", "in", `(COMPLETED,CANCELLED,REJECTED,DRAFT)`)
          .limit(1);

        const isActive = activeRef && activeRef.length > 0;

        if (!isActive) {
          // Orphan — delete from storage bucket
          const { error: orphanErr } = await supabase.storage
            .from(BUCKET)
            .remove([doc.file_path]);

          if (orphanErr) {
            // Only warn — file might have already been deleted by Part A
            console.warn(`[cleanup] Orphan storage delete warn (${doc.file_path}): ${orphanErr.message}`);
            stats.orphansFailed++;
          } else {
            stats.orphansDeleted++;
            console.log(`[cleanup] Deleted orphan file: ${doc.file_path}`);
          }
        }

        // Clean the tracker row regardless — it's past its useful TTL
        const { error: rowErr } = await supabase
          .from("uploaded_documents")
          .delete()
          .eq("id", doc.id);

        if (!rowErr) stats.orphanRowsCleaned++;
      }
    } else {
      console.log("[cleanup] Part B: no stale upload tracking rows");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PART C — Write structured run log to cleanup_logs for observability
    // ══════════════════════════════════════════════════════════════════════════

    const elapsedMs = Date.now() - runStart;
    const logStatus = errors.length === 0 ? "SUCCESS" : "PARTIAL_SUCCESS";

    const { error: logErr } = await supabase.from("cleanup_logs").insert({
      deleted_count: stats.ordersDeleted + stats.orphansDeleted,
      status: logStatus,
      errors: errors.length > 0 ? errors.join(" | ") : null,
    });

    if (logErr) {
      // Non-critical — don't let logging failure mask the cleanup result
      console.warn("[cleanup] Failed to write cleanup_logs row:", logErr.message);
    }

    const summary = {
      success: true,
      status: logStatus,
      ...stats,
      totalDeleted: stats.ordersDeleted + stats.orphansDeleted,
      errorCount: errors.length,
      errors,
      elapsedMs,
      ranAt: new Date().toISOString(),
    };

    console.info("[cleanup] Run complete:", JSON.stringify(summary));
    return NextResponse.json(summary);

  } catch (err) {
    // Top-level safety net — should never fire due to inner try/catch blocks
    const message = err instanceof Error ? err.message : "Unknown critical error";
    console.error("[cleanup] CRITICAL FAILURE:", message);

    // Best-effort log even on critical failure
    await supabase.from("cleanup_logs").insert({
      deleted_count: stats.ordersDeleted,
      status: "FAILED",
      errors: message,
    }).catch(() => {/* swallow log error */});

    return NextResponse.json(
      { success: false, error: "Cleanup failed", message, elapsedMs: Date.now() - runStart },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — health check / manual trigger info
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader  = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "ready",
    bucket: BUCKET,
    retentionHours: 2,
    batchLimit: BATCH_LIMIT,
    schedule: "0 */2 * * * (every 2 hours via Vercel Cron)",
    safeDeletionStatuses: SAFE_STATUSES,
    description: "POST to this endpoint to trigger a cleanup run",
  });
}
