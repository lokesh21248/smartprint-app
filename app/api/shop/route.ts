import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("clerk_owner_id", userId)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ shop: !!shop });
}
