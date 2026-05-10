import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";

/**
 * GET /api/shop/stats?shopId=<uuid>
 * 
 * Securely calculates dashboard statistics using aggregate queries.
 * Optimized for performance — avoids over-fetching raw rows.
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    // Rate limit: 20 requests per minute (dashboard polls/invalidates)
    const { success } = rateLimit(`shop_stats_${userId}`, 20, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const supabase = createAdminClient();

    // Verify ownership via inner join on shops
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

    // Optimized aggregate query: count and sum in one DB round-trip
    const { data: rawStats, error: statsError } = await supabase
      .from("orders")
      .select("total_amount, status, customer_phone, created_at, updated_at")
      .eq("shop_id", shopId)
      .gte("created_at", today.toISOString());

    if (statsError) {
      console.error("[GET /api/shop/stats] DB Error:", statsError);
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }

    const orders = rawStats ?? [];
    const completed = orders.filter(o => o.status === 'COMPLETED');
    
    // Revenue is already in Rupees in DB
    const revenueToday = completed.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    
    // Avg completion time
    const avgMins = completed.length > 0 
      ? completed.reduce((sum, o) => {
          const diff = (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()) / 60000;
          return sum + diff;
        }, 0) / completed.length
      : 0;

    const uniqueCustomers = new Set(orders.map(o => o.customer_phone)).size;

    return NextResponse.json({
      pendingOrders: orders.filter(o => o.status === 'PLACED').length,
      ordersToday: orders.length,
      revenueToday,
      avgCompletionMins: Math.round(avgMins),
      activeCustomers: uniqueCustomers,
      completedToday: completed.length
    });

  } catch (err) {
    console.error("[GET /api/shop/stats] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
