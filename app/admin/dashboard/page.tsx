import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminOverviewClient } from "@/components/admin/AdminOverviewClient";

export const metadata: Metadata = { title: "Overview | Admin" };

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();

  // 1. Fetch Aggregated Stats (Parallel)
  const [
    totalShopsRes,
    activeShopsRes,
    pendingApprovalRes,
    ordersCountRes,
    revenueRes,
    latestOrdersRes
  ] = await Promise.all([
    supabase.from("shops").select("id", { count: "exact", head: true }),
    supabase.from("shops").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("shops").select("id", { count: "exact", head: true }).eq("is_approved", false),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("total_amount").eq("status", "COMPLETED"),
    supabase.from("orders").select("id, short_token, customer_name, status, created_at").order("created_at", { ascending: false }).limit(20)
  ]);

  const totalShops = totalShopsRes.count || 0;
  const activeShops = activeShopsRes.count || 0;
  const pendingApproval = pendingApprovalRes.count || 0;
  
  const totalOrders = ordersCountRes.count || 0;
  const totalRevenue = (revenueRes.data || []).reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

  const stats = {
    totalShops,
    activeShops,
    totalRevenue,
    totalOrders,
    pendingApproval
  };

  // 2. Pre-compute Chart Data on Server (Last 7 Days)
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const { data: chartOrders } = await supabase
    .from("orders")
    .select("total_amount, created_at")
    .gte("created_at", sevenDaysAgo.toISOString());

  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
    const dayOrders = (chartOrders || []).filter((o) => {
      const orderDate = new Date(o.created_at);
      return orderDate.getDate() === d.getDate() && orderDate.getMonth() === d.getMonth();
    });
    return {
      day: dayStr,
      revenue: dayOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0),
      orders: dayOrders.length,
    };
  });

  return (
    <AdminOverviewClient 
      stats={stats} 
      latestOrders={(latestOrdersRes.data || []) as {
        id: string;
        short_token: string;
        customer_name: string;
        status: string;
        created_at: string;
      }[]} 
      chartData={chartData} 
    />
  );
}
