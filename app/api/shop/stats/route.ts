import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { validateApiAccess } from "@/lib/auth/role-guard";
import { getClientIp } from "@/lib/utils/ip";
import { canManageShop } from "@/lib/auth/shop-access";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // 1. Strict Role Guard
    const { authorized, response, userId } = await validateApiAccess([
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

    const ip = getClientIp(request);
    const { success } = rateLimit(`shop_stats_${userId}`, 20, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // ─── OWNERSHIP/ROLE CHECK ────────────────────────────────────────────────
    const isAuthorized = await canManageShop(userId, shopId);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Shop not found or access denied" }, { status: 404 });
    }

    const supabase = createAdminClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // ── Parallelise: targeted stats queries ────────────────────────
    // FIX P4: replaced the unbounded "fetch all orders" approach with 3 targeted
    // queries. Each query returns only the rows needed for that specific metric,
    // capped at 500 rows. For high-volume shops, consider moving to a DB function
    // (get_shop_stats) to push aggregation fully into Postgres.
    const [pendingResult, todayOrdersResult, completedResult] = await Promise.all([
      // Pending orders count (PLACED or NEW)
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .in("status", ["PLACED", "NEW"]),

      // Today's created orders (for ordersToday count + unique customer count)
      supabase
        .from("orders")
        .select("customer_phone, status, total_amount, created_at, updated_at, completed_at")
        .eq("shop_id", shopId)
        .gte("created_at", todayIso)
        .limit(500), // generous cap — prevents unbounded payload on busy days

      // Today's completed orders (for revenue + avg completion time)
      supabase
        .from("orders")
        .select("total_amount, created_at, completed_at, updated_at")
        .eq("shop_id", shopId)
        .in("status", ["COMPLETED", "SUCCESS"])
        .gte("completed_at", todayIso)
        .limit(500),
    ]);

    if (pendingResult.error || todayOrdersResult.error || completedResult.error) {
      console.error("[shop/stats] Query error:", {
        pending: pendingResult.error?.message,
        today: todayOrdersResult.error?.message,
        completed: completedResult.error?.message,
        shopId,
        ip,
      });
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }

    const todayOrders = todayOrdersResult.data ?? [];
    const completed = completedResult.data ?? [];

    // Revenue: sum of today's completed orders
    const revenueToday = completed.reduce(
      (sum, o) => sum + (Number(o.total_amount) || 0),
      0
    );

    // Average completion time in minutes
    const avgMins =
      completed.length > 0
        ? completed.reduce((sum, o) => {
            const compTime = o.completed_at
              ? new Date(o.completed_at).getTime()
              : new Date(o.updated_at).getTime();
            const diff = (compTime - new Date(o.created_at).getTime()) / 60_000;
            return sum + diff;
          }, 0) / completed.length
        : 0;

    // Unique customers today (by phone number)
    const uniqueCustomers = new Set(todayOrders.map((o) => o.customer_phone)).size;

    return NextResponse.json({
      pendingOrders: pendingResult.count ?? 0,
      ordersToday: todayOrders.length,
      revenueToday,
      avgCompletionMins: Math.round(avgMins),
      activeCustomers: uniqueCustomers,
      completedToday: completed.length,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
