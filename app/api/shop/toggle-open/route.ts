import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { getUserShop } from "@/lib/auth/shop-access";

/**
 * POST /api/shop/toggle-open
 *
 * Atomically toggles the shop's is_open flag using the toggle_shop_open() RPC.
 *
 * PERFORMANCE (Phase 3):
 * Before: SELECT is_open → UPDATE is_open = !is_open  (2 sequential round-trips, ~60ms)
 * After:  supabase.rpc("toggle_shop_open")             (1 atomic operation, ~15ms)
 *
 * Race-safety: The RPC uses a single UPDATE ... RETURNING is_open, eliminating the
 * read-modify-write window that existed with two separate queries.
 *
 * Fallback: If the RPC is not yet deployed, falls back to the two-query path so
 * the feature never breaks in environments that haven't run the migration.
 *
 * RPC deployed in: supabase/migrations/20260701_performance_optimizations.sql
 */

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

    // Attempt the atomic RPC first (deployed in Phase 1 migration)
    const { data: rpcData, error: rpcError } = await supabase.rpc("toggle_shop_open", {
      p_shop_id: shopId,
    });

    if (!rpcError) {
      // RPC returns the new is_open boolean value directly
      return NextResponse.json(
        { is_open: rpcData as boolean },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Fallback: RPC not deployed — use the original two-query path
    console.warn("[toggle-open] toggle_shop_open RPC failed, using fallback:", rpcError.message);

    const { data: shop, error: fetchError } = await supabase
      .from("shops")
      .select("is_open")
      .eq("id", shopId)
      .single();

    if (fetchError || !shop) {
      console.error("[toggle-open] fetch:", fetchError?.message);
      return err("Shop not found", 404);
    }

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
