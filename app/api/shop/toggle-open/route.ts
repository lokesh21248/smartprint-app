import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { getUserShop } from "@/lib/auth/shop-access";

/**
 * POST /api/shop/toggle-open
 *
 * Toggles the shop's is_open flag.
 *
 * Before: SELECT is_open → UPDATE is_open = !is_open  (2 queries, race condition window)
 * After:  same 2 steps but with a shared error helper and explicit return types.
 *
 * For a fully atomic single-query toggle, deploy:
 *   supabase/migrations/20260701_performance_optimizations.sql
 * then replace both queries with:
 *   supabase.rpc("toggle_shop_open", { shop_id: shopId })
 */

// Shared factory — keeps response shape consistent and removes repetition
const err = (message: string, status: number): NextResponse =>
  NextResponse.json({ error: message }, { status });

export async function POST(): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    if (!userId) return err("Unauthorized", 401);

    const { success } = rateLimit(`toggle_open_${userId}`, 20, 60);
    if (!success) return err("Too many requests", 429);

    const shopId = await getUserShop(userId);
    if (!shopId) return err("Shop not found", 404);

    const supabase = createAdminClient();

    // Step 1 — read current state
    const { data: shop, error: fetchError } = await supabase
      .from("shops")
      .select("is_open")
      .eq("id", shopId)
      .single();

    if (fetchError || !shop) {
      console.error("[toggle-open] fetch:", fetchError?.message);
      return err("Shop not found", 404);
    }

    // Step 2 — write opposite state
    const { data: updated, error: updateError } = await supabase
      .from("shops")
      .update({ is_open: !shop.is_open, updated_at: new Date().toISOString() })
      .eq("id", shopId)
      .select("is_open")
      .single();

    if (updateError || !updated) {
      console.error("[toggle-open] update:", updateError?.message);
      return err("Failed to toggle shop status", 500);
    }

    return NextResponse.json(
      { is_open: updated.is_open },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[toggle-open] unexpected:", e);
    return err("Internal server error", 500);
  }
}
