import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { validateApiAccess } from "@/lib/auth/role-guard";

export async function POST() {
  try {
    // 1. Strict Role Guard
    const { authorized, response, userId, role } = await validateApiAccess(["admin", "shop_owner"]);
    if (!authorized) return response;

    // 2. Rate limit — 20 toggles/min per user
    const { success } = rateLimit(`toggle_open_${userId}`, 20, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const supabase = createAdminClient();

    // 3. Verify ownership/access and get current state
    const { data: shop, error } = await supabase
      .from("shops")
      .select("id, is_open")
      .eq("clerk_owner_id", userId)
      .maybeSingle();

    if (error || !shop) {
      // If user is admin but not the owner of THIS specific shop, they might need different logic
      // but for now we follow the owner-only rule for this specific toggle.
      return NextResponse.json({ error: "Shop not found or access denied" }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("shops")
      .update({ is_open: !shop.is_open, updated_at: new Date().toISOString() })
      .eq("id", shop.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ is_open: !shop.is_open });
  } catch (err) {
    console.error("[POST /api/shop/toggle-open] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
