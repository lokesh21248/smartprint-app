import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageShop } from "@/lib/auth/shop-access";

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
    const { data, error } = await supabase
      .from("shop_settings")
      .select("sound_alerts, notification_sound")
      .eq("shop_id", shopId)
      .maybeSingle();

    if (error) {
      console.error("[GET /api/shop/settings] DB fetch error:", error);
      return NextResponse.json({ error: "Database error fetching settings" }, { status: 500 });
    }

    if (data) {
      return NextResponse.json({
        soundEnabled: data.sound_alerts ?? true,
        notificationSound: data.notification_sound ?? "whatsapp",
      });
    }

    // Seed default settings row if it doesn't exist
    const defaultSettings = {
      shop_id: shopId,
      sound_alerts: true,
      notification_sound: "whatsapp",
    };

    const { error: insertError } = await supabase
      .from("shop_settings")
      .upsert(defaultSettings, { onConflict: "shop_id" });

    if (insertError) {
      console.error("[GET /api/shop/settings] DB seed error:", insertError);
      return NextResponse.json({ error: "Database error seeding settings" }, { status: 500 });
    }

    return NextResponse.json({
      soundEnabled: true,
      notificationSound: "whatsapp",
    });
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

    const { shopId, soundEnabled, notificationSound } = body;
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

    // Fetch existing settings to do partial update/upsert
    const { data: existingSettings } = await supabase
      .from("shop_settings")
      .select("sound_alerts, notification_sound")
      .eq("shop_id", shopId)
      .maybeSingle();

    const updatedSettings = {
      shop_id: shopId,
      sound_alerts: soundEnabled !== undefined ? soundEnabled : (existingSettings?.sound_alerts ?? true),
      notification_sound: notificationSound !== undefined ? notificationSound : (existingSettings?.notification_sound ?? "whatsapp"),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("shop_settings")
      .upsert(updatedSettings, { onConflict: "shop_id" });

    if (error) {
      console.error("[POST /api/shop/settings] DB upsert error:", error);
      return NextResponse.json({ error: "Database error updating settings" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/shop/settings] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
