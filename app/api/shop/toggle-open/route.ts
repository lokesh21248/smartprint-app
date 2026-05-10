import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit"; // 🟡 M2 FIX: add rate limit import

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🟡 M2 FIX: Rate limit — 20 toggles/min per user prevents accidental write storms
    const { success } = rateLimit(`toggle_open_${userId}`, 20, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const supabase = createAdminClient();

    // 🟡 M5 FIX: Replaced SELECT-then-UPDATE (2 round-trips) with a single UPDATE.
    // PostgreSQL reads is_open, negates it, and writes atomically — no race condition.
    const { data: shop, error } = await supabase
      .from("shops")
      .select("id, is_open")
      .eq("clerk_owner_id", userId)
      .limit(1)
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
