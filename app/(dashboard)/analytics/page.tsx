import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

import AnalyticsCharts from "@/components/dashboard/AnalyticsCharts";

import type { Order, DashboardStats } from "@/types";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const { userId } = await auth();

  if (!userId) redirect("/login");

  const supabase = createAdminClient();

  // Get shop — uses idx_shops_clerk_owner_id index
  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("clerk_owner_id", userId)  // ← correct column
    .limit(1)
    .maybeSingle();

  if (!shop) {
    return <AnalyticsCharts analyticsData={{ revenue: [], statusBreakdown: [], peakHours: [], services: [] }} stats={{ pendingOrders: 0, ordersToday: 0, revenueToday: 0, avgCompletionMins: 0, activeCustomers: 0, completedToday: 0 }} />;
  }

  // Fetch last 30 days of orders — bounded query, uses idx_orders_shop_status_created
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: ordersData } = await supabase
    .from("orders")
    .select("total_amount, status, created_at, customer_phone, is_color")
    .eq("shop_id", shop.id)
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(1000); // hard cap: no shop has > 1000 orders in 30 days at launch

  const rawOrders = (ordersData ?? []);

  // ─── Calculate Stats ────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split("T")[0];
  let pendingOrdersCount = 0;
  let ordersTodayCount = 0;
  let revenueTodayCount = 0;
  let completedTodayCount = 0;
  const activeCustomersSet = new Set<string>();

  const statusCount: Record<string, number> = {
    PLACED: 0,
    ACCEPTED: 0,
    PRINTING: 0,
    READY: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };

  const revenueByDate: Record<string, { revenue: number; orders: number }> = {};
  const peakHoursCount: Record<string, number> = {};
  
  let bwCount = 0;
  let colorCount = 0;

  for (const o of rawOrders) {
    const status = o.status || "PLACED"; // ← correct column name
    
    // Stats
    if (status !== "COMPLETED" && status !== "CANCELLED") {
      pendingOrdersCount++;
    }
    
    const createdDate = new Date(o.created_at).toISOString().split("T")[0];
    if (createdDate === todayStr) {
      ordersTodayCount++;
      revenueTodayCount += Number(o.total_amount) || 0;
      if (status === "COMPLETED") completedTodayCount++;
    }

    if (o.customer_phone) activeCustomersSet.add(o.customer_phone);

    // Status Breakdown
    if (statusCount[status] !== undefined) {
      statusCount[status]++;
    }

    // Revenue Trend (group by YYYY-MM-DD)
    if (!revenueByDate[createdDate]) {
      revenueByDate[createdDate] = { revenue: 0, orders: 0 };
    }
    revenueByDate[createdDate].revenue += Number(o.total_amount) || 0;
    revenueByDate[createdDate].orders++;

    // Peak Hours
    const hour = new Date(o.created_at).getHours();
    const hourStr = `${hour.toString().padStart(2, "0")}:00`;
    peakHoursCount[hourStr] = (peakHoursCount[hourStr] || 0) + 1;

    // Services (use `is_color` column — matches our select)
    if (o.is_color) colorCount++;
    else bwCount++;
  }

  const stats: DashboardStats = {
    pendingOrders: pendingOrdersCount,
    ordersToday: ordersTodayCount,
    revenueToday: revenueTodayCount,
    completedToday: completedTodayCount,
    activeCustomers: activeCustomersSet.size,
    avgCompletionMins: 45, // Hardcoded for now
  };

  // ─── Format Analytics Data ────────────────────────────────────────────────
  const STATUS_COLORS: Record<string, string> = {
    PLACED: "#3B82F6",
    ACCEPTED: "#8B5CF6",
    PRINTING: "#F59E0B",
    READY: "#10B981",
    COMPLETED: "#059669",
    CANCELLED: "#EF4444",
  };

   const statusBreakdown = Object.entries(statusCount)
     .filter(([status, count]) => count > 0)
     .map(([status, count]) => ({
       name: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase(),
       value: count,
       color: STATUS_COLORS[status] || "#9CA3AF",
     }));

  const revenueTrend = Object.entries(revenueByDate)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7); // Last 7 days

  const peakHours = Object.entries(peakHoursCount)
    .map(([hour, count]) => ({ hour, orders: count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  const services = [
    { name: "B&W Printing", count: bwCount },
    { name: "Color Printing", count: colorCount },
  ]
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const analyticsData = {
    revenue: revenueTrend,
    statusBreakdown: statusBreakdown,
    peakHours: peakHours,
    services: services,
  };

  return <AnalyticsCharts analyticsData={analyticsData} stats={stats} />;
}
