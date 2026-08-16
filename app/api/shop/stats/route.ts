import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitHeaders } from "@/lib/ratelimit";
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
 * PERFORMANCE (Phase 3):
 * Before: 3 parallel queries → fetch ≤200 raw orders + ALL reviews → JS filter/reduce
 * After:  2 parallel queries (RPC + shop) → 0 rows transferred → Postgres aggregation
 *
 * The get_shop_stats() RPC was deployed in:
 *   20260702_performance_optimizations_phase2.sql
 * It uses a single-scan FILTER-based aggregation over the orders table.
 *
 * Also updated in migration 20260812000001_normalize_status_indexes.sql to
 * recognize lowercase status values ('new', 'accepted', etc.) inserted after
 * the status normalization fix.
 */
export async function GET(request: Request) {
  const start = Date.now();
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
    const rlResult = rateLimit(`shop_stats_${userId}`, 20, 60);
    if (!rlResult.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rlResult, 20) }
      );
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

    // 4. Two parallel queries:
    //    a) get_shop_stats RPC — all aggregation in Postgres, 0 rows transferred
    //    b) shop details — only 4 fields needed for the response
    //
    // The RPC replaces: orders fetch (≤200 rows) + reviews fetch (all rows)
    // + JS filter/reduce for revenue, completion time, pending count, unique customers.
    const [rpcResult, shopResult] = await Promise.all([
      supabase.rpc("get_shop_stats", {
        p_shop_id: shopId,
        p_today:   todayIso,
      }),
      supabase
        .from("shops")
        .select("name, address_line1, city, state")
        .eq("id", shopId)
        .maybeSingle(),
    ]);

    // Fallback: if the RPC is unavailable (function not yet deployed), run the
    // original parallel queries so the dashboard never goes blank.
    if (rpcResult.error) {
      console.warn("[shop/stats] get_shop_stats RPC failed — falling back to direct queries:", rpcResult.error.message);

      const [ordersRes, reviewsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("total_amount, status, created_at, updated_at, completed_at, customer_phone")
          .eq("shop_id", shopId)
          .or(`created_at.gte.${todayIso},completed_at.gte.${todayIso}`)
          .limit(200),
        supabase
          .from("reviews")
          .select("rating")
          .eq("shop_id", shopId)
          .limit(500),
      ]);

      const rawOrders = ordersRes.data ?? [];
      const todayStart = today;

      const completedOrders = rawOrders.filter((o) => {
        const s = o.status?.toUpperCase();
        if (s !== "COMPLETED" && s !== "SUCCESS") return false;
        const compDate = o.completed_at ? new Date(o.completed_at) : new Date(o.updated_at);
        return compDate >= todayStart;
      });

      const totalRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      const avgMins =
        completedOrders.length > 0
          ? completedOrders.reduce((sum, o) => {
              const ct = o.completed_at ? new Date(o.completed_at).getTime() : new Date(o.updated_at).getTime();
              return sum + (ct - new Date(o.created_at).getTime()) / 60000;
            }, 0) / completedOrders.length
          : 0;

      const ordersToday = rawOrders.filter((o) => new Date(o.created_at) >= todayStart);
      const uniqueCustomers = new Set(ordersToday.map((o) => o.customer_phone || "anonymous")).size;
      const pendingOrders = rawOrders.filter((o) => {
        const s = o.status?.toUpperCase();
        return s === "PLACED" || s === "NEW";
      }).length;

      const reviewsData = reviewsRes.data ?? [];
      const avgRating =
        reviewsData.length > 0
          ? reviewsData.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewsData.length
          : 0;

      const shopData = shopResult.data;
      const location = shopData
        ? [shopData.city, shopData.state].filter(Boolean).join(", ") || shopData.address_line1 || ""
        : "";

      const statsResponse = NextResponse.json({
        pendingOrders:     pendingOrders,
        ordersToday:       rawOrders.length,
        revenueToday:      totalRevenue,
        avgCompletionMins: Math.round(avgMins),
        activeCustomers:   uniqueCustomers,
        completedToday:    completedOrders.length,
        order_count:       completedOrders.length,
        rating:            Number(avgRating.toFixed(1)),
        location,
        shop_name:         shopData?.name ?? "",
      });
      statsResponse.headers.set("Cache-Control", "private, s-maxage=30, stale-while-revalidate=60");
      return statsResponse;
    }

    // 5. RPC succeeded — map the typed response to the API contract
    if (shopResult.error) {
      console.error("[shop/stats] shop fetch error:", shopResult.error.message);
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }

    // The RPC returns a single row (RETURNS TABLE with one result from LIMIT 1)
    const rpcRow = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;

    if (!rpcRow) {
      // Shop exists but has no orders yet — return zeroed stats
      const shopData = shopResult.data;
      const location = shopData
        ? [shopData.city, shopData.state].filter(Boolean).join(", ") || shopData.address_line1 || ""
        : "";
      return NextResponse.json({
        pendingOrders: 0, ordersToday: 0, revenueToday: 0,
        avgCompletionMins: 0, activeCustomers: 0, completedToday: 0,
        order_count: 0, rating: 0, location, shop_name: shopData?.name ?? "",
      });
    }

    const shopData = shopResult.data;
    const location = shopData
      ? [shopData.city, shopData.state].filter(Boolean).join(", ") || shopData.address_line1 || ""
      : "";

    const statsResponse = NextResponse.json({
      pendingOrders:     Number(rpcRow.pending_orders),
      ordersToday:       Number(rpcRow.orders_today),
      revenueToday:      Number(rpcRow.revenue_today),
      avgCompletionMins: Math.round(Number(rpcRow.avg_completion_min)),
      activeCustomers:   Number(rpcRow.unique_customers),
      completedToday:    Number(rpcRow.completed_today),
      order_count:       Number(rpcRow.total_completed),
      rating:            Number(Number(rpcRow.avg_rating).toFixed(1)),
      location,
      shop_name:         shopData?.name ?? "",
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(`[PERF] Dashboard API: ${Date.now() - start} ms`);
    }

    // Allow CDN/browser to serve stale stats for up to 30s while revalidating.
    // Realtime subscription invalidates on every INSERT/UPDATE, making this
    // a pure safety-net for reconnection scenarios.
    statsResponse.headers.set("Cache-Control", "private, s-maxage=30, stale-while-revalidate=60");
    return statsResponse;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
