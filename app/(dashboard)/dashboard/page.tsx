import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

import type { DashboardStats, Order, Shop } from "@/types";
import { User as UserIcon, Store, Mail } from "lucide-react";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { getShopByUserId } from "@/lib/data/shop";
import { PendingCountSeeder } from "@/components/dashboard/PendingCountSeeder";

import { StatsSection } from "@/components/dashboard/StatsSection";
import { NewOrdersFeed } from "@/components/dashboard/NewOrdersFeed";
import { PendingOrdersBanner } from "@/components/dashboard/PendingOrdersBanner";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your print shop orders, view analytics, and control your shop status from one place.",
};

// Force dynamic: this page is user-specific — ISR would cache one user's data
// and serve it to others sharing the same CDN cache key.
export const dynamic = "force-dynamic";



async function getDashboardData(userId: string): Promise<{
  stats: DashboardStats;
  newOrders: Order[];
  shop: Shop | null;
}> {
  try {
    const supabase = createAdminClient();
    // Use the cached shop data to avoid duplicate DB calls
    const shop = await getShopByUserId(userId);

    if (!shop) {
      return { stats: { pendingOrders: 0, ordersToday: 0, revenueToday: 0, avgCompletionMins: 0, activeCustomers: 0, completedToday: 0 }, newOrders: [], shop: null };
    }



    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [ordersResult, newOrdersResult] = await Promise.all([
      supabase
        .from("orders")
        .select("total_amount, status, created_at, updated_at, completed_at, customer_phone")
        .eq("shop_id", shop.id)
        .or(`created_at.gte.${today.toISOString()},completed_at.gte.${today.toISOString()}`)
        .limit(200), // Cap to prevent unbounded payload on high-volume shops
      supabase
        .from("orders")
        .select("id, short_token, customer_name, customer_phone, file_name, page_count, copies, is_color, is_double_sided, notes, total_amount, status, status_history, created_at, updated_at")
        .eq("shop_id", shop.id)
        .in("status", ["PLACED", "placed", "new", "NEW"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const rawOrders = ordersResult.data ?? [];
    
    // An order is completed today if its status is COMPLETED/SUCCESS and completed_at (or updated_at) is today
    const completedOrders = rawOrders.filter((o) => {
      const s = o.status?.toUpperCase();
      const isCompleted = s === "COMPLETED" || s === "SUCCESS";
      if (!isCompleted) return false;
      const compDate = o.completed_at ? new Date(o.completed_at) : new Date(o.updated_at);
      return compDate >= today;
    });

    const totalRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const avgMins =
      completedOrders.length > 0
        ? completedOrders.reduce((sum, o) => {
            const compTime = o.completed_at ? new Date(o.completed_at).getTime() : new Date(o.updated_at).getTime();
            const diff = (compTime - new Date(o.created_at).getTime()) / 60000;
            return sum + diff;
          }, 0) / completedOrders.length
        : 0;

    const ordersToday = rawOrders.filter(o => new Date(o.created_at) >= today);
    const uniqueCustomers = new Set(
      ordersToday.map((o) => o.customer_phone || "anonymous")
    ).size;

    const mappedNewOrders = (newOrdersResult.data ?? []).map((ord) => ({
      id: ord.id as string,
      short_token: ord.short_token as string,
      customer_name: ord.customer_name as string,
      customer_phone: ord.customer_phone as string,
      file_name: ord.file_name as string,
      page_count: (ord.page_count as number) || 0,
      copies: (ord.copies as number) || 1,
      color: (ord.is_color as boolean) || false,
      double_sided: (ord.is_double_sided as boolean) || false,
      notes: (ord.notes as string) || undefined,
      total_amount: ord.total_amount as number,
      order_status: ord.status as Order["order_status"],
      status_history: (ord.status_history as Order["status_history"]) || [],
      created_at: ord.created_at as string,
      updated_at: ord.updated_at as string,
    }));

    return {
      stats: {
        pendingOrders: rawOrders.filter((o) => {
          const s = o.status?.toUpperCase();
          return s === "PLACED" || s === "NEW";
        }).length,
        ordersToday: rawOrders.length,
        revenueToday: totalRevenue,
        avgCompletionMins: Math.round(avgMins),
        activeCustomers: uniqueCustomers,
        completedToday: completedOrders.length,
      },
      newOrders: mappedNewOrders as unknown as Order[],
      shop: shop as Shop,
    };
  } catch (err) {
    console.error("[getDashboardData] ❌ Error:", err);
    return { stats: { pendingOrders: 0, ordersToday: 0, revenueToday: 0, avgCompletionMins: 0, activeCustomers: 0, completedToday: 0 }, newOrders: [], shop: null };
  }
}

export default async function DashboardPage() {
  // Parallelize auth — single auth() call, no currentUser() needed
  const { userId } = await auth();
  
  const data = userId
    ? await getDashboardData(userId)
    : { stats: { pendingOrders: 0, ordersToday: 0, revenueToday: 0, avgCompletionMins: 0, activeCustomers: 0, completedToday: 0 }, newOrders: [], shop: null };

  if (!data.shop) return <div>Shop not found. Please log in properly.</div>;
  
  const { stats, newOrders, shop } = data;
  const ownerDisplayName = shop?.owner_name || "N/A";
  const shopDisplayName = shop?.name || "N/A";
  const emailDisplay = shop?.owner_email || "N/A";

  return (
    <div className="space-y-6">
      {/* User Info Card */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm flex flex-wrap gap-6 items-center">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E8F5EE] flex items-center justify-center">
              <UserIcon className="h-4 w-4 text-[#2E8B57]" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-bold">Owner</p>
              <p className="text-sm font-semibold text-[#111827]">{ownerDisplayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E8F5EE] flex items-center justify-center">
              <Store className="h-4 w-4 text-[#2E8B57]" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-bold">Shop</p>
              <p className="text-sm font-semibold text-[#111827]">{shopDisplayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E8F5EE] flex items-center justify-center">
              <Mail className="h-4 w-4 text-[#2E8B57]" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-bold">Email</p>
              <p className="text-sm font-semibold text-[#111827]">{emailDisplay}</p>
            </div>
          </div>
        </div>
      </div>

      <PendingOrdersBanner count={stats?.pendingOrders || 0} />
      {/* Seed the orderStore.pendingCount so the bell badge is correct immediately */}
      <PendingCountSeeder count={stats?.pendingOrders || 0} />

      <StatsSection initialStats={stats} shopId={shop.id} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <NewOrdersFeed initialOrders={newOrders} shopId={shop.id} />
        </div>
        <div>
          <QuickActions shop={shop} />
        </div>
      </div>
    </div>
  );
}
