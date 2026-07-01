import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopProfileSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/ratelimit";
import { generateShopCode } from "@/lib/utils/crypto";
import { canManageShop, getUserShop } from "@/lib/auth/shop-access";
import { invalidateShopPricingCache } from "@/lib/cache/pricing";


// ─── PATCH /api/shop/update ───────────────────────────────────────────────────
// Accepts the full shop profile body validated by ShopProfileSchema.
// Only the supplied fields are written to the DB — true PATCH semantics.
export async function PATCH(request: Request) {
  try {
    // 1. Auth guard
    const authObj = await auth();
    const userId = authObj.userId;
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

    const clerkRole = String(
      (authObj.sessionClaims?.metadata as Record<string, unknown> | undefined)?.role ?? ""
    )
      .trim()
      .toLowerCase();

    const isAuthorized = await canManageShop(userId, shopId, clerkRole);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Forbidden: Not authorized to manage this shop" },
        { status: 403 }
      );
    }

    const parsed = ShopProfileSchema.partial().safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string | undefined;
        if (field) fieldErrors[field] = issue.message;
      }
      return NextResponse.json({ error: "Validation failed", fieldErrors }, { status: 400 });
    }

    const patch = parsed.data;
    const supabase = createAdminClient();

    // 4. Build the update payload dynamically to avoid overwriting unsupplied fields with undefined
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.phone !== undefined) payload.owner_phone = patch.phone;
    if (patch.owner_email !== undefined) payload.owner_email = patch.owner_email;
    if (patch.address !== undefined) payload.address_line1 = patch.address;
    if (patch.price_bw_per_page !== undefined) payload.price_bw_per_page = patch.price_bw_per_page;
    if (patch.price_color_per_page !== undefined) payload.price_color_per_page = patch.price_color_per_page;

    // Only update shop_code if explicitly provided — never auto-generate on every PATCH.
    // Auto-generating silently changes QR codes and customer-facing shop codes.
    if (patch.shop_code !== undefined) {
      payload.shop_code = patch.shop_code;
    }

    // Check if any business_hours fields are explicitly passed
    const hasOpening = body.opening_time !== undefined;
    const hasClosing = body.closing_time !== undefined;
    const hasWorkingDays = body.working_days !== undefined;
    const hasServices = body.services !== undefined;

    if (hasOpening || hasClosing || hasWorkingDays || hasServices) {
      const { data: existingShop } = await supabase
        .from("shops")
        .select("business_hours")
        .eq("id", shopId)
        .maybeSingle();

      type BusinessHoursData = {
        opening_time?: string;
        closing_time?: string;
        working_days?: string[];
        services?: string[];
      };
      const existingHours = (existingShop?.business_hours as BusinessHoursData) || {};

      payload.business_hours = {
        opening_time: hasOpening ? patch.opening_time : existingHours.opening_time,
        closing_time: hasClosing ? patch.closing_time : existingHours.closing_time,
        working_days: hasWorkingDays ? patch.working_days : existingHours.working_days,
        services: hasServices ? patch.services : existingHours.services,
      };
    }

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

    // Invalidate the pricing cache so the next order sees updated prices immediately
    // (affects both Redis and the per-instance Map fallback)
    if (patch.price_bw_per_page !== undefined || patch.price_color_per_page !== undefined) {
      void invalidateShopPricingCache(shopId);
    }

    return NextResponse.json(
      { success: true, shopId: updatedShop.id },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[PATCH /api/shop/update] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Keep POST alias for backward-compatibility during the rollout window.
// Remove after all callers have been migrated to PATCH.
export { PATCH as POST };
