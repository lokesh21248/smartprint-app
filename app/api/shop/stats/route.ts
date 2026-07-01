import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { validateApiAccess } from "@/lib/auth/role-guard";
import { canManageShop } from "@/lib/auth/shop-access";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

/**
 * GET /api/shop/stats
 *
 * Returns real-time dashboard stats for a shop.
 *
 * PERFORMANCE OPTIMIZATION (FIX H1):
 * Before: 6 parallel Supabase queries → fetch up to 1,500 raw rows → JS Array.reduce()
 * After:  1 get_shop_stats() RPC call  → all aggregation in Postgres → 0 raw rows transferred
 *
 * Prerequisite: run supabase/migrations/20260701_performance_optimizations.sql
 */
export async function GET(request: Request) {
  try {
    // 1. Strict Role Guard
    const { authorized, response, userId, clerkRole } = await validateApiAccess([
      "admin",
      "shop_owner",
      "manager",
      "staff",
    ]);
    if (!authorized) return response;

    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    // 2. Rate limit: 20 requests / 60s per user
    const { success } = rateLimit(`shop_stats_${userId}`, 20, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // 3. Ownership/role check
    const isAuthorized = await canManageShop(userId, shopId, clerkRole);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Shop not found or access denied" }, { status: 404 });
    }

    const supabase = createAdminClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // 4. Single RPC call — all aggregation happens inside Postgres.
    //    Replaces 6 parallel queries + 3 Array.reduce() calls.
    //    Shop details still need a separate query (not part of stats RPC scope).
    const [statsResult, shopResult] = await Promise.all([
      supabase.rpc("get_shop_stats", {
        p_shop_id: shopId,
        p_today: todayIso,
      }),
      supabase
        .from("shops")
        .select("name, address_line1, city, state")
        .eq("id", shopId)
        .maybeSingle(),
    ]);

    if (statsResult.error) {
      console.error("[shop/stats] RPC error:", {
        message: statsResult.error.message,
        hint:    statsResult.error.hint,
        shopId,
      });
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }

    const stats = statsResult.data as {
      pending_orders:     number;
      orders_today:       number;
      unique_customers:   number;
      revenue_today:      number;
      avg_completion_min: number;
      completed_today:    number;
      total_completed:    number;
      avg_rating:         number;
    } | null;

    if (!stats) {
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }

    const shopData = shopResult.data;
    const location = shopData
      ? [shopData.city, shopData.state].filter(Boolean).join(", ") ||
        shopData.address_line1 ||
        ""
      : "";

    const statsResponse = NextResponse.json({
      pendingOrders:    Number(stats.pending_orders),
      ordersToday:      Number(stats.orders_today),
      revenueToday:     Number(stats.revenue_today),
      avgCompletionMins: Math.round(Number(stats.avg_completion_min)),
      activeCustomers:  Number(stats.unique_customers),
      completedToday:   Number(stats.completed_today),
      order_count:      Number(stats.total_completed),
      rating:           Number(Number(stats.avg_rating).toFixed(1)),
      location,
      shop_name:        shopData?.name ?? "",
    });

    // Allow edge/CDN to serve stale stats for up to 30s while revalidating;
    // client-side realtime invalidation makes polling redundant within that window.
    statsResponse.headers.set("Cache-Control", "private, s-maxage=30, stale-while-revalidate=60");
    return statsResponse;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
