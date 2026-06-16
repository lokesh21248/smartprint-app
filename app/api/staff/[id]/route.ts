import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Look up the staff record to retrieve shop_id
    const { data: staffRecord, error: fetchError } = await supabase
      .from("shop_staff")
      .select("shop_id")
      .eq("id", params.id)
      .maybeSingle();

    if (fetchError || !staffRecord) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const shopId = staffRecord.shop_id;

    // Check if user is authorized to manage the shop
    const { canManageShop } = await import("@/lib/auth/shop-access");
    const isAuthorized = await canManageShop(userId, shopId);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden: Not authorized to manage staff for this shop" }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from("shop_staff")
      .delete()
      .eq("id", params.id)
      .eq("shop_id", shopId)
      .neq("role", "owner");

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
