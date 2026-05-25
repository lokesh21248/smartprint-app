import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { validateApiAccess } from "@/lib/auth/role-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // 1. Strict Role Guard
    const { authorized, response, userId } = await validateApiAccess(["admin", "shop_owner", "manager", "staff"]);
    if (!authorized) return response;

    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    const { success } = rateLimit(`shop_stats_${userId}`, 20, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const supabase = createAdminClient();

    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("id", shopId)
      .eq("clerk_owner_id", userId)
      .single();

    if (shopError || !shop) {
      return NextResponse.json({ error: "Shop not found or access denied" }, { status: 404 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: rawStats, error: statsError } = await supabase
      .from("orders")
      .select("total_amount, status, customer_phone, created_at, updated_at, completed_at")
      .eq("shop_id", shopId)
      .or(`created_at.gte.${today.toISOString()},completed_at.gte.${today.toISOString()}`);

    if (statsError) {
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }

    const orders = rawStats ?? [];
    
    // An order is completed today if its status is COMPLETED/SUCCESS and completed_at (or updated_at) is today
    const completed = orders.filter(o => {
      const s = o.status?.toUpperCase();
      const isCompleted = s === 'COMPLETED' || s === 'SUCCESS';
      if (!isCompleted) return false;
      const compDate = o.completed_at ? new Date(o.completed_at) : new Date(o.updated_at);
      return compDate >= today;
    });

    const revenueToday = completed.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const avgMins = completed.length > 0 
      ? completed.reduce((sum, o) => {
          const compTime = o.completed_at ? new Date(o.completed_at).getTime() : new Date(o.updated_at).getTime();
          const diff = (compTime - new Date(o.created_at).getTime()) / 60000;
          return sum + diff;
        }, 0) / completed.length
      : 0;

    // Filters today's placed orders using created_at >= today
    const ordersToday = orders.filter(o => new Date(o.created_at) >= today);
    const uniqueCustomers = new Set(ordersToday.map(o => o.customer_phone)).size;

    return NextResponse.json({
      pendingOrders: orders.filter(o => {
        const s = o.status?.toUpperCase();
        return s === 'PLACED' || s === 'NEW';
      }).length,
      ordersToday: ordersToday.length,
      revenueToday,
      avgCompletionMins: Math.round(avgMins),
      activeCustomers: uniqueCustomers,
      completedToday: completed.length
    });

  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
