import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

import nextDynamic from "next/dynamic";

const AnalyticsCharts = nextDynamic(() => import("@/components/dashboard/AnalyticsCharts"), {
  ssr: false,
  loading: () => (
    <div className="h-96 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center animate-pulse">
      <div className="text-sm font-semibold text-slate-400">Loading charts...</div>
    </div>
  ),
});

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

  // Minimal shape required by AnalyticsCharts — avoids `any[]`
  // updated_at must be string (non-nullable) to match the AnalyticsCharts.RawOrder interface
  type RawOrder = {
    total_amount: number;
    status: string;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    customer_phone: string | null;
    is_color: boolean;
  };

  const rawOrders: RawOrder[] = (ordersData ?? []).map((o) => ({
    total_amount: Number(o.total_amount) || 0,
    status: (o.status as string) || "PLACED",
    created_at: (o.created_at as string) || "",
    updated_at: (o.updated_at as string) || (o.created_at as string) || "",
    completed_at: (o.completed_at as string | null) ?? null,
    customer_phone: (o.customer_phone as string | null) ?? null,
    is_color: Boolean(o.is_color),
  }));

  return <AnalyticsCharts orders={rawOrders} />;
}
