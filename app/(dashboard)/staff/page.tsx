import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { StaffList } from "@/components/dashboard/StaffList";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShopStaff } from "@/types";
import { getShopByUserId } from "@/lib/data/shop";

export const metadata: Metadata = { title: "Staff" };
export const revalidate = 60;

export default async function StaffPage() {
  const { userId } = await auth();

  if (!userId) redirect("/login");

  const shop = await getShopByUserId(userId);

  if (!shop) {
    return <StaffList initialStaff={[]} shopId="" />;
  }

  const supabase = createAdminClient();

  // Get staff
  const { data: staffData } = await supabase
    .from("shop_staff")
    .select("id, user_id, role, permissions, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  return <StaffList initialStaff={(staffData as ShopStaff[]) ?? []} shopId={shop.id} />;
}
