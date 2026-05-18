import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

import type { DashboardStats, Order, Shop } from "@/types";
import { User as UserIcon, Store, Mail } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { getShopByUserId } from "@/lib/data/shop";

import { StatsSection } from "@/components/dashboard/StatsSection";
import { NewOrdersFeed } from "@/components/dashboard/NewOrdersFeed";
import { PendingOrdersBanner } from "@/components/dashboard/PendingOrdersBanner";

export const metadata: Metadata = { title: "Dashboard" };
export const revalidate = 60; // Cache dashboard data for 60 seconds



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

    const start = performance.now();
    const [ordersResult, newOrdersResult] = await Promise.all([
      supabase
        .from("orders")
        .select("total_amount, status, created_at, updated_at, customer_phone")
        .eq("shop_id", shop.id)
        .gte("created_at", today.toISOString()),
      supabase
        .from("orders")
        .select("id, short_token, customer_name, customer_phone, file_name, page_count, copies, is_color, is_double_sided, notes, total_amount, status, status_history, created_at, updated_at")
        .eq("shop_id", shop.id)
        .eq("status", "PLACED")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    const duration = performance.now() - start;
    console.log(`[getDashboardData] ⏱️ DB Query for ${userId} took ${duration.toFixed(2)}ms`);

    const rawOrders = ordersResult.data ?? [];
    const totalRevenue = rawOrders
      .filter((o) => o.status === "COMPLETED")
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const completedOrders = rawOrders.filter((o) => o.status === "COMPLETED");
    const avgMins =
      completedOrders.length > 0
        ? completedOrders.reduce((sum, o) => {
            const diff =
              (new Date(o.updated_at).getTime() -
                new Date(o.created_at).getTime()) /
              60000;
            return sum + diff;
          }, 0) / completedOrders.length
        : 0;

    const uniqueCustomers = new Set(
      rawOrders.map((o) => o.customer_phone || "anonymous")
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
        pendingOrders: rawOrders.filter((o) => o.status === "PLACED").length,
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
  // Parallelize auth and user fetching to avoid waterfall
  const [authData, user] = await Promise.all([
    auth(),
    currentUser()
  ]);
  
  const { userId } = authData;
  
  const data = userId && user
    ? await getDashboardData(userId)
    : { stats: { pendingOrders: 0, ordersToday: 0, revenueToday: 0, avgCompletionMins: 0, activeCustomers: 0, completedToday: 0 }, newOrders: [], shop: null };

  if (!data.shop) return <div>Shop not found. Please log in properly.</div>;
  
  const { stats, newOrders, shop } = data;
  const ownerDisplayName = shop?.owner_name || "N/A";
  const shopDisplayName = shop?.name || "N/A";
  const emailDisplay = shop?.owner_email || "N/A";

  return (
    <div className="space-y-6">
      {/* Requirement 7 & 9: User Info Header + Logout */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm flex flex-wrap gap-6 items-center justify-between">
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
        
        <div className="w-full sm:w-auto">
          <LogoutButton className="border border-red-100 py-2.5 px-4" />
        </div>
      </div>

      <PendingOrdersBanner count={stats?.pendingOrders || 0} />

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
