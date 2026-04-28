import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

    // Create shop
    const { data, error } = await supabase
      .from("shops")
      .insert({
        owner_id: userId,
        shop_name: shopName || "My Shop",
        address: location || "TBD",
        city: "TBD",
        state: "TBD",
        pincode: "000000",
        phone: phone || "TBD",
        email: user.emailAddresses[0].emailAddress,
        is_approved: true, // Auto-approve for this refactor demo
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating shop:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, shopId: data.id });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
