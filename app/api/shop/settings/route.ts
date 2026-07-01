import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageShop } from "@/lib/auth/shop-access";
import { z } from "zod";

// ─── Validation schema ────────────────────────────────────────────────────────
const SettingsPatchSchema = z.object({
  shopId: z.string().uuid("shopId must be a valid UUID"),
  soundEnabled: z.boolean().optional(),
  // Extend this enum when new sounds are added to the audio manager
  notificationSound: z.enum(["whatsapp", "bell", "chime", "ding", "none"]).optional(),
});

export async function GET(request: Request) {
  try {
    const authObj = await auth();
    const userId = authObj.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    if (!shopId) {
      return NextResponse.json({ error: "shopId is required" }, { status: 400 });
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

    const supabase = createAdminClient();

    // Use maybeSingle() — if no settings exist, it returns null without throwing an error.
    // We don't need to UPSERT on GET; we can just return defaults if no row exists.
    const { data, error } = await supabase
      .from("shop_settings")
      .select("sound_alerts, notification_sound")
      .eq("shop_id", shopId)
      .maybeSingle();

    if (error) {
      console.error("[GET /api/shop/settings] DB error:", error);
      return NextResponse.json({ error: "Database error fetching settings" }, { status: 500 });
    }

    return NextResponse.json(
      {
        soundEnabled: data?.sound_alerts ?? true,
        notificationSound: data?.notification_sound ?? "whatsapp",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[GET /api/shop/settings] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authObj = await auth();
    const userId = authObj.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Validate with Zod — prevents type coercion bugs and unknown field injection
    const parsed = SettingsPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid settings", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { shopId, soundEnabled, notificationSound } = parsed.data;
    if (!shopId) {
      return NextResponse.json({ error: "shopId is required" }, { status: 400 });
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

    const supabase = createAdminClient();

    // Single upsert — no pre-fetch needed. Only update fields that were explicitly provided.
    // Partial update via conditional spread keeps existing values for omitted fields.
    const { error } = await supabase
      .from("shop_settings")
      .upsert(
        {
          shop_id: shopId,
          ...(soundEnabled !== undefined && { sound_alerts: soundEnabled }),
          ...(notificationSound !== undefined && { notification_sound: notificationSound }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shop_id" }
      );

    if (error) {
      console.error("[POST /api/shop/settings] DB upsert error:", error);
      return NextResponse.json({ error: "Database error updating settings" }, { status: 500 });
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[POST /api/shop/settings] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
