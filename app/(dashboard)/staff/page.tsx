import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { StaffList } from "@/components/dashboard/StaffList";
import { createClient } from "@/lib/supabase/server";
import { DEMO_STAFF, DEMO_SHOP } from "@/lib/demo-data";
import type { ShopStaff } from "@/types";

export const metadata: Metadata = { title: "Staff" };

const IS_DEMO =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project");

export default async function StaffPage() {
  const { userId } = await auth();
  
  if (IS_DEMO) {
    return <StaffList initialStaff={DEMO_STAFF} shopId={DEMO_SHOP.id} />;
  }

  if (!userId) redirect("/login");

  const supabase = await createClient();

  // Get shop
  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (!shop) {
    return <StaffList initialStaff={[]} shopId="" />;
  }

  // Get staff
  const { data: staffData } = await supabase
    .from("shop_staff")
    .select("*")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  return <StaffList initialStaff={(staffData as ShopStaff[]) ?? []} shopId={shop.id} />;
}
