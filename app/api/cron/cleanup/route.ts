import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/cron/cleanup
 *
 * Production-safe auto-cleanup for SmartPrint:
 * - Deletes COMPLETED/CANCELLED orders older than 6 hours
 * - Deletes DRAFT orders older than 30 minutes
 * - Removes storage files BEFORE deleting DB rows (no orphan files)
 * - Never crashes: errors are logged, processing continues
 *
 * Protected by CRON_SECRET so only Vercel Cron can trigger it.
 * Schedule: every 1 hour via vercel.json
 */

const SAFE_STATUSES_FOR_DELETION = ["COMPLETED", "CANCELLED"] as const;
const STORAGE_BUCKET = "orders";

export async function POST(request: Request) {
  // Initialize Supabase admin client (fresh instance per request)
  const supabase = createAdminClient();

  // ── Cron Secret Guard ───────────────────────────────────────────────────────
  // Vercel Cron sends this header automatically when CRON_SECRET is set
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    filesDeleted: 0,
    filesFailed: 0,
    ordersDeleted: 0,
    ordersFailed: 0,
    draftsCleaned: 0,
    errors: [] as string[],
  };

  try {
    // ── Step 1: Fetch orders eligible for cleanup ─────────────────────────────
    // COMPLETED/CANCELLED orders older than 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    const { data: terminalOrders, error: fetchError } = await supabase
      .from("orders")
      .select("id, file_s3_key, status, created_at")
      .in("status", SAFE_STATUSES_FOR_DELETION)
      .lt("created_at", sixHoursAgo)
      .limit(100); // Process max 100 per run to stay within timeout

    if (fetchError) {
      console.error("[cleanup] Failed to fetch terminal orders:", fetchError.message);
      results.errors.push(`Fetch terminal orders: ${fetchError.message}`);
    }

    // ── Step 2: Fetch stale DRAFT orders (older than 30 minutes) ─────────────
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: draftOrders, error: draftFetchError } = await supabase
      .from("orders")
      .select("id, file_s3_key, status, created_at")
      .eq("status", "DRAFT")
      .lt("created_at", thirtyMinsAgo)
      .limit(50);

    if (draftFetchError) {
      console.error("[cleanup] Failed to fetch draft orders:", draftFetchError.message);
      results.errors.push(`Fetch draft orders: ${draftFetchError.message}`);
    }

    const allEligible = [...(terminalOrders ?? []), ...(draftOrders ?? [])];

    if (allEligible.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No orders eligible for cleanup",
        elapsedMs: Date.now() - startTime,
      });
    }

    // ── Step 3: Delete storage files FIRST, then DB rows ─────────────────────
    // Critical: never leave orphaned files in storage
    for (const order of allEligible) {
      // 3a. Delete storage file (best-effort: failure doesn't block DB delete)
      if (order.file_s3_key) {
        try {
          const { error: storageError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([order.file_s3_key]);

          if (storageError) {
            // Log and continue — don't crash the whole batch
            const msg = `Storage delete failed for order ${order.id}: ${storageError.message}`;
            console.error(`[cleanup] ${msg}`);
            results.errors.push(msg);
            results.filesFailed++;
          } else {
            results.filesDeleted++;
          }
        } catch (storageErr) {
          const msg = `Storage delete threw for order ${order.id}: ${String(storageErr)}`;
          console.error(`[cleanup] ${msg}`);
          results.errors.push(msg);
          results.filesFailed++;
        }
      }

      // 3b. Delete the DB row
      try {
        const { error: dbError } = await supabase
          .from("orders")
          .delete()
          .eq("id", order.id)
          // Safety check: NEVER delete active orders even if they somehow appear
          .in("status", ["COMPLETED", "CANCELLED", "DRAFT"]);

        if (dbError) {
          const msg = `DB delete failed for order ${order.id}: ${dbError.message}`;
          console.error(`[cleanup] ${msg}`);
          results.errors.push(msg);
          results.ordersFailed++;
        } else {
          results.ordersDeleted++;
          if (order.status === "DRAFT") results.draftsCleaned++;
        }
      } catch (dbErr) {
        const msg = `DB delete threw for order ${order.id}: ${String(dbErr)}`;
        console.error(`[cleanup] ${msg}`);
        results.errors.push(msg);
        results.ordersFailed++;
      }
    }

    const summary = {
      success: true,
      ...results,
      totalEligible: allEligible.length,
      elapsedMs: Date.now() - startTime,
      ranAt: new Date().toISOString(),
    };

    console.info("[cleanup] Run complete:", JSON.stringify(summary));
    return NextResponse.json(summary);

  } catch (err) {
    // Top-level safety net — should never reach here due to inner try/catches
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cleanup] Critical failure:", message);
    return NextResponse.json(
      { error: "Cleanup failed", message, elapsedMs: Date.now() - startTime },
      { status: 500 }
    );
  }
}

// GET handler for manual health check / dashboard trigger
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "ready",
    description: "POST to this endpoint to trigger cleanup",
    schedule: "Every 1 hour via Vercel Cron",
  });
}
