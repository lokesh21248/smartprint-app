import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertShop } from "@/lib/supabase/shop";
import { NextResponse } from "next/server";

export async function POST() {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shopName, phone, location } = user.unsafeMetadata as {
    shopName: string;
    phone: string;
    location: string;
  };

  try {
    const supabase = createAdminClient();
    
    // Check if shop already exists
    const { data: existing } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, shopId: existing.id });
    }

    // Create shop using centralized service
    const data = await upsertShop(supabase, {
      userId,
      email: user.emailAddresses[0].emailAddress,
      name: shopName,
      address: location,
      phone: phone,
    });

    return NextResponse.json({ ok: true, shopId: data.id });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
