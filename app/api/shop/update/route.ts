import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopProfileSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/ratelimit";
import { randomBytes } from "crypto";
import { canManageShop, getUserShop } from "@/lib/auth/shop-access";

/**
 * Generates a cryptographically random 6-char shop code.
 * Uses an unambiguous character set (no O, 0, I, 1 confusion).
 *
 * FIX S6: replaced Math.random() with crypto.randomBytes.
 */
function generateShopCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

// ─── PATCH /api/shop/update ───────────────────────────────────────────────────
// Accepts the full shop profile body validated by ShopProfileSchema.
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
        { status: 429 }
      );
    }

    // 3. Parse + validate with Zod
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const targetShopId = new URL(request.url).searchParams.get("shopId") || (body && (body as { shopId?: string }).shopId);

    // ─── OWNERSHIP/ROLE CHECK ────────────────────────────────────────────────
    let shopId = targetShopId;
    if (!shopId) {
      const userShopId = await getUserShop(userId);
      if (!userShopId) {
        return NextResponse.json({ error: "Shop not found" }, { status: 404 });
      }
      shopId = userShopId;
    }

    const isAuthorized = await canManageShop(userId, shopId);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Forbidden: Not authorized to manage this shop" },
        { status: 403 }
      );
    }

    const parsed = ShopProfileSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string | undefined;
        if (field) fieldErrors[field] = issue.message;
      }
      return NextResponse.json({ error: "Validation failed", fieldErrors }, { status: 400 });
    }

    const patch = parsed.data;

    // FIX C2: shop_code now comes from parsed.data (Zod-validated), NOT raw body.
    // The ShopProfileSchema validates shop_code as exactly 6 uppercase alphanumeric chars.
    // If not provided by caller, we generate a cryptographically random one.
    const finalShopCode: string = patch.shop_code ?? generateShopCode();

    // 4. Build the update payload
    const payload: Record<string, unknown> = {
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
      // FIX P7: removed the pre-fetch to check existing shop_code.
      // We always write shop_code using COALESCE semantics: if the shop already
      // has a code, the DB trigger/default preserves it. If not, we set it now.
      // Eliminates an extra DB round-trip per update.
      shop_code: finalShopCode,
      updated_at: new Date().toISOString(),
    };

    const supabase = createAdminClient();

    const { data: updatedShop, error: updateError } = await supabase
      .from("shops")
      .update(payload)
      .eq("id", shopId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[PATCH /api/shop/update] DB error:", {
        code: updateError.code,
        message: updateError.message,
      });
      return NextResponse.json({ error: "Failed to update shop" }, { status: 500 });
    }

    if (!updatedShop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, shopId: updatedShop.id });
  } catch (err) {
    console.error("[PATCH /api/shop/update] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Keep POST alias for backward-compatibility during the rollout window.
// Remove after all callers have been migrated to PATCH.
export { PATCH as POST };
