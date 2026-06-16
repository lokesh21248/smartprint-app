import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";

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

    const supabase = createAdminClient();

    // Find the shop ID for this user (either as owner or staff)
    let shopId: string | null = null;

    const { data: ownerShop } = await supabase
      .from("shops")
      .select("id")
      .eq("clerk_owner_id", userId)
      .maybeSingle();

    if (ownerShop) {
      shopId = ownerShop.id;
    } else {
      const { data: staffRecord } = await supabase
        .from("shop_staff")
        .select("shop_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (staffRecord) {
        shopId = staffRecord.shop_id;
      }
    }

    if (!shopId) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const { data: shop, error } = await supabase
      .from("shops")
      .select("id, is_open")
      .eq("id", shopId)
      .maybeSingle();

    if (error || !shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("shops")
      .update({ is_open: !shop.is_open, updated_at: new Date().toISOString() })
      .eq("id", shop.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ is_open: !shop.is_open });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
