import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { getUserShop } from "@/lib/auth/shop-access";

/**
 * POST /api/shop/toggle-open
 *
 * Atomically toggles the shop's is_open flag using a single Postgres UPDATE
 * via the toggle_shop_open() RPC function.
 *
 * Before: SELECT is_open → UPDATE is_open = !is_open  (2 queries, race condition window)
 * After:  RPC toggle_shop_open(shop_id)               (1 atomic query, race-safe)
 *
 * Prerequisite: run supabase/migrations/20260701_performance_optimizations.sql
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { success } = rateLimit(`toggle_open_${userId}`, 20, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Resolve the shop for this user (owner or staff)
    const shopId = await getUserShop(userId);
    if (!shopId) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const supabase = createAdminClient();

    // Single atomic UPDATE via RPC — no SELECT + UPDATE race condition
    const { data: isOpen, error } = await supabase.rpc("toggle_shop_open", {
      p_shop_id: shopId,
    });

    if (error) {
      // RPC raises an exception if shop is not found
      if (error.message?.includes("not found")) {
        return NextResponse.json({ error: "Shop not found" }, { status: 404 });
      }
      console.error("[POST /api/shop/toggle-open] RPC error:", error.message);
      return NextResponse.json({ error: "Failed to toggle shop status" }, { status: 500 });
    }

    return NextResponse.json(
      { is_open: isOpen },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
