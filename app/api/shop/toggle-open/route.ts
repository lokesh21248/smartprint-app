import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, is_open")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (shopError || !shop) {
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
