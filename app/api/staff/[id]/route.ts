import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiAccess } from "@/lib/auth/role-guard";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Strict Role Guard
    const { authorized, response, userId } = await validateApiAccess(["admin", "shop_owner"]);
    if (!authorized) return response;

    const supabase = createAdminClient();

    // 2. Get the shop owned by this user
    // (Admins might need to specify a shopId, but for now we follow the owner's context)
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("clerk_owner_id", userId)
      .maybeSingle();

    if (shopError || !shop) {
      return NextResponse.json({ error: "Shop not found or you are not the owner" }, { status: 403 });
    }

    // 3. Delete the staff member if they belong to this shop and are NOT the owner
    const { error: deleteError } = await supabase
      .from("shop_staff")
      .delete()
      .eq("id", params.id)
      .eq("shop_id", shop.id)
      .neq("role", "owner");

    if (deleteError) {
      console.error("[DELETE /api/staff/[id]] DB error:", deleteError);
      return NextResponse.json({ error: "Failed to delete staff member" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/staff/[id]] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
