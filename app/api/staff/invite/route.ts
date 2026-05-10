import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StaffInviteSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = StaffInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { email, role } = parsed.data;
    const supabase = createAdminClient();

    // 1. Get the shop owned by this user
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("clerk_owner_id", userId)  // ← correct column
      .single();

    if (shopError || !shop) {
      return NextResponse.json({ error: "Shop not found or you are not an owner" }, { status: 403 });
    }

    // 2. check if user already exists in shop_staff
    const { data: existing } = await supabase
      .from("shop_staff")
      .select("id")
      .eq("shop_id", shop.id)
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "User already invited or part of team" }, { status: 400 });
    }

    // 3. Insert into shop_staff
    // In a real app, you'd send an email invite. Here we'll just add the entry.
    const { data: newStaff, error: inviteError } = await supabase
      .from("shop_staff")
      .insert({
        shop_id: shop.id,
        email,
        role,
        is_active: true
      })
      .select()
      .single();

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, staff: newStaff });
  } catch (err) {
    console.error("Staff invite error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
