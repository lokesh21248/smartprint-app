import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

import AnalyticsCharts from "@/components/dashboard/AnalyticsCharts";

export const metadata: Metadata = {
  title: "Analytics",
  description: "View revenue trends, order status breakdowns, peak hours, and service analytics for your print shop.",
};
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { userId } = await auth();

  if (!userId) redirect("/login");

  const supabase = createAdminClient();

  // Get shop — uses idx_shops_clerk_owner_id index
  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("clerk_owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (!shop) {
    return <AnalyticsCharts orders={[]} />;
  }

  // Fetch orders — either 30 days ago or start of current month, whichever is earlier
  const now = new Date();
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const earliestDate = startOfCurrentMonth < thirtyDaysAgo ? startOfCurrentMonth : thirtyDaysAgo;
  const rangeStartIso = earliestDate.toISOString();

  const { data: ordersData } = await supabase
    .from("orders")
    .select("total_amount, status, created_at, updated_at, completed_at, customer_phone, is_color")
    .eq("shop_id", shop.id)
    .gte("created_at", rangeStartIso)
    .order("created_at", { ascending: false })
    .limit(1500); // slightly increased cap to accommodate up to 1500 orders

  const rawOrders = (ordersData ?? []) as any[];

  return <AnalyticsCharts orders={rawOrders} />;
}
