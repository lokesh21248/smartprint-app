import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StaffInviteSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(request: Request) {
  try {
    const authObj = await auth();
    const userId = authObj.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { success } = rateLimit(`staff_invite_${userId}`, 10, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = StaffInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { email, role } = parsed.data;
    const supabase = createAdminClient();

    // 1. Get the shop associated with this user
    const { getUserShop, canManageShop } = await import("@/lib/auth/shop-access");
    const shopId = await getUserShop(userId);

    if (!shopId) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    // Verify user is authorized to manage staff for this shop
    const clerkRole = String(
      (authObj.sessionClaims?.metadata as Record<string, unknown> | undefined)?.role ?? ""
    )
      .trim()
      .toLowerCase();

    const isAuthorized = await canManageShop(userId, shopId, clerkRole);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden: Not authorized to invite staff to this shop" }, { status: 403 });
    }

    // 2. check if user already exists in shop_staff
    const { data: existing } = await supabase
      .from("shop_staff")
      .select("id")
      .eq("shop_id", shopId)
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
        shop_id: shopId,
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
