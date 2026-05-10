import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopProfileSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/ratelimit";

// ─── PATCH /api/shop/update ───────────────────────────────────────────────────
// Accepts a partial body with any subset of { name, phone, address }.
// Only the supplied fields are written to the DB — true PATCH semantics.
export async function PATCH(request: Request) {
  try {
    // 1. Auth guard
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Rate limit — keyed on userId (authenticated write endpoint)
    //    10 updates / 60s is generous for real users, blocks automated abuse.
    const { success: rateLimitOk } = rateLimit(`shop_update_${userId}`, 10, 60);
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429 },
      );
    }

    // 2. Parse + validate with Zod
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Use the full schema for comprehensive updates
    const parsed = ShopProfileSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string | undefined;
        if (field) fieldErrors[field] = issue.message;
      }
      return NextResponse.json(
        { error: "Validation failed", fieldErrors },
        { status: 400 },
      );
    }

    const patch = parsed.data;
    const supabase = createAdminClient();

    // ── 5. Handle shop_code fallback ───────────────────────────────────────
    // If the shop doesn't have a code, generate one now.
    // This handles legacy shops created before the trigger was active.
    let finalShopCode = body.shop_code?.trim().toUpperCase();
    
    // Fetch existing shop to check code
    const { data: currentShop } = await supabase
      .from("shops")
      .select("shop_code")
      .eq("clerk_owner_id", userId)
      .single();

    if (!currentShop?.shop_code && !finalShopCode) {
      // Logic for random 6-char code generation
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      finalShopCode = "";
      for (let i = 0; i < 6; i++) {
        finalShopCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    // ── 6. Build the update payload ────────────────────────────────────────
    const payload: Record<string, any> = {
      name: patch.name,
      owner_phone: patch.phone,
      owner_email: patch.owner_email,
      address_line1: patch.address,
      price_bw_per_page: patch.price_bw_per_page,
      price_color_per_page: patch.price_color_per_page,
      business_hours: {
        opening_time: patch.opening_time,
        closing_time: patch.closing_time,
        working_days: patch.working_days,
        services: patch.services,
      },
      updated_at: new Date().toISOString(),
    };

    if (finalShopCode) {
      payload.shop_code = finalShopCode;
    }

    const { data: updatedShop, error: updateError } = await supabase
      .from("shops")
      .update(payload)
      .eq("clerk_owner_id", userId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[PATCH /api/shop/update] DB error:", updateError);
      return NextResponse.json(
        { error: "Failed to update shop" },
        { status: 500 },
      );
    }

    if (!updatedShop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, shopId: updatedShop.id });
  } catch (err) {
    console.error("[PATCH /api/shop/update] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Keep POST alias for backward-compatibility during the rollout window.
// Remove after all callers have been migrated to PATCH.
export { PATCH as POST };
