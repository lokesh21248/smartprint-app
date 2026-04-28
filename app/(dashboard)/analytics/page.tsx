import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AnalyticsCharts } from "@/components/dashboard/AnalyticsCharts";
import { createClient } from "@/lib/supabase/server";
import { DEMO_ANALYTICS, DEMO_STATS } from "@/lib/demo-data";
import type { Order, DashboardStats } from "@/types";

export const metadata: Metadata = { title: "Analytics" };

const IS_DEMO =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project");

export default async function AnalyticsPage() {
  const { userId } = await auth();
  
  if (IS_DEMO) {
    return <AnalyticsCharts analyticsData={DEMO_ANALYTICS} stats={DEMO_STATS} />;
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
    return <AnalyticsCharts analyticsData={DEMO_ANALYTICS} stats={DEMO_STATS} />;
  }

  // Fetch all orders for this shop
  const { data: ordersData } = await supabase
    .from("orders")
    .select("*")
    .eq("shop_id", shop.id);

  const orders = (ordersData as Order[]) || [];

  // ─── Calculate Stats ────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split("T")[0];
  let pendingOrders = 0;
  let ordersToday = 0;
  let revenueToday = 0;
  let completedToday = 0;
  let activeCustomersSet = new Set<string>();

  const statusCount: Record<string, number> = {
    DRAFT: 0,
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

  for (const o of orders) {
    // Stats
    if (o.order_status !== "COMPLETED" && o.order_status !== "CANCELLED" && o.order_status !== "DRAFT") {
      pendingOrders++;
    }
    
    const createdDate = new Date(o.created_at).toISOString().split("T")[0];
    if (createdDate === todayStr) {
      ordersToday++;
      revenueToday += Number(o.total_amount) || 0;
      if (o.order_status === "COMPLETED") completedToday++;
    }

    if (o.customer_phone) activeCustomersSet.add(o.customer_phone);

    // Status Breakdown
    if (statusCount[o.order_status] !== undefined) {
      statusCount[o.order_status]++;
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

    // Services
    if (o.color) colorCount++;
    else bwCount++;
  }

  const stats: DashboardStats = {
    pendingOrders,
    ordersToday,
    revenueToday,
    completedToday,
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
    DRAFT: "#9CA3AF",
  };

  const statusBreakdown = Object.entries(statusCount)
    .filter(([_, count]) => count > 0)
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
    revenue: revenueTrend.length ? revenueTrend : DEMO_ANALYTICS.revenue,
    statusBreakdown: statusBreakdown.length ? statusBreakdown : DEMO_ANALYTICS.statusBreakdown,
    peakHours: peakHours.length ? peakHours : DEMO_ANALYTICS.peakHours,
    services: services.length ? services : DEMO_ANALYTICS.services,
  };

  return <AnalyticsCharts analyticsData={analyticsData} stats={stats} />;
}
