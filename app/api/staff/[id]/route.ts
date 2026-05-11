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

    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("clerk_owner_id", userId)
      .single();

    if (shopError || !shop) {
      return NextResponse.json({ error: "Shop not found or you are not an owner" }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from("shop_staff")
      .delete()
      .eq("id", params.id)
      .eq("shop_id", shop.id)
      .neq("role", "owner");

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
