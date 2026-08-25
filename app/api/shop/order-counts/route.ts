import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { validateApiAccess } from "@/lib/auth/role-guard";
import { canManageShop } from "@/lib/auth/shop-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/shop/order-counts?shopId=...
 *
 * Returns accurate per-status order counts for the Orders page tab badges.
 * Uses the existing get_shop_stats RPC (extended in migration
 * 20260825000001_shop_stats_per_status_counts.sql) which computes all counts
 * in a single Postgres table scan.
 *
 * This endpoint exists because the orders-list API is paginated (30/page),
 * so counts derived from the client-side array are always wrong when there
 * are more than 30 orders. This endpoint returns the true database totals.
 */
export async function GET(request: Request) {
  const { authorized, response, userId, clerkRole } = await validateApiAccess([
    "admin",
    "shop_owner",
    "manager",
    "staff",
  ]);
  if (!authorized) return response;

  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId")?.trim();

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    // Rate limit: 60 req / 60s per user
    const { success } = rateLimit(`order_counts_${userId}`, 60, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Ownership check (cached — near-zero cost on warm instances)
    const isAuthorized = await canManageShop(userId, shopId, clerkRole);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Shop not found or access denied" }, { status: 404 });
    }

    const supabase = createAdminClient();

    // Single call to the existing RPC — extended to include per-status counts.
    // Uses a single table scan with FILTER aggregation (no extra queries).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data, error } = await supabase.rpc("get_shop_stats", {
      p_shop_id: shopId,
      p_today: today.toISOString(),
    });

    if (error) {
      console.error("[order-counts] RPC error:", error.message);
      // Fallback: return a direct COUNT query if RPC is unavailable
      const { count: total } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId);

      return NextResponse.json({
        total: total ?? 0,
        placed: 0,
        accepted: 0,
        printing: 0,
        ready: 0,
        completed: 0,
        cancelled: 0,
      });
    }

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json(
      {
        total:     Number(row?.total_orders     ?? 0),
        placed:    Number(row?.placed_count     ?? 0),
        accepted:  Number(row?.accepted_count   ?? 0),
        printing:  Number(row?.printing_count   ?? 0),
        ready:     Number(row?.ready_count      ?? 0),
        completed: Number(row?.completed_count  ?? 0),
        cancelled: Number(row?.cancelled_count  ?? 0),
      },
      {
        // 30s stale-while-revalidate — short enough to stay fresh,
        // long enough to avoid hammering the DB on every key press.
        headers: { "Cache-Control": "private, s-maxage=30, stale-while-revalidate=60" },
      }
    );
  } catch (err) {
    console.error("[order-counts] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
