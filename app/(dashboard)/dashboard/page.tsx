import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { PendingOrdersBanner } from "@/components/dashboard/PendingOrdersBanner";
import { NewOrdersFeed } from "@/components/dashboard/NewOrdersFeed";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { DEMO_STATS, DEMO_ORDERS, DEMO_SHOP } from "@/lib/demo-data";
import type { DashboardStats, Order, Shop } from "@/types";
import { User, Store, Mail } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";

export const metadata: Metadata = { title: "Dashboard" };

const IS_DEMO =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project");

async function getDashboardData(userId: string, clerkUser: User | null): Promise<{
  stats: DashboardStats;
  newOrders: Order[];
  shop: Shop;
}> {
  if (IS_DEMO) {
    return {
      stats: DEMO_STATS,
      newOrders: DEMO_ORDERS.filter((o) => o.order_status === "PLACED"),
      shop: DEMO_SHOP,
    };
  }

  try {
    const supabase = await createClient();
    let { data: shop } = await supabase
      .from("shops")
      .select("*")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (!shop && clerkUser) {
      const meta = (clerkUser.unsafeMetadata || {}) as any;
      const { data: newShop, error: createError } = await supabase.from("shops").insert({
        owner_id: userId,
        name: meta.shopName || clerkUser.firstName + "'s Shop" || "My Shop",
        address: meta.location || "TBD",
        phone: meta.phone || "TBD",
        owner_email: clerkUser.emailAddresses?.[0]?.emailAddress,
        is_approved: true,
        is_active: true,
        price_bw_per_page: 1,
        price_color_per_page: 5,
      }).select().single();
      
      if (!createError && newShop) {
        shop = newShop;
      }
    }

    if (!shop) return { stats: DEMO_STATS, newOrders: [], shop: DEMO_SHOP };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [ordersResult, newOrdersResult] = await Promise.all([
      supabase
        .from("orders")
        .select("total_amount, order_status, created_at, updated_at, customer_id, customer_phone")
        .eq("shop_id", shop.id)
        .gte("created_at", today.toISOString()),
      supabase
        .from("orders")
        .select("*")
        .eq("shop_id", shop.id)
        .eq("order_status", "PLACED")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const orders = ordersResult.data ?? [];
    const totalRevenue = orders
      .filter((o) => o.order_status === "COMPLETED")
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const completedOrders = orders.filter((o) => o.order_status === "COMPLETED");
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
      orders.map((o) => o.customer_phone || "anonymous")
    ).size;

    return {
      stats: {
        pendingOrders: orders.filter((o) => o.order_status === "PLACED").length,
        ordersToday: orders.length,
        revenueToday: totalRevenue,
        avgCompletionMins: Math.round(avgMins),
        activeCustomers: uniqueCustomers,
        completedToday: completedOrders.length,
      },
      newOrders: (newOrdersResult.data ?? []) as Order[],
      shop: shop as Shop,
    };
  } catch (err) {
    console.error("Dashboard error:", err);
    return { stats: DEMO_STATS, newOrders: [], shop: DEMO_SHOP };
  }
}

export default async function DashboardPage() {
  const { userId } = await auth();
  const user = await currentUser();
  
  const { stats, newOrders, shop } = userId 
    ? await getDashboardData(userId, user) 
    : { stats: DEMO_STATS, newOrders: [], shop: DEMO_SHOP };

  const metadata = user?.unsafeMetadata as any;

  return (
    <div className="space-y-6">
      {/* Requirement 7 & 9: User Info Header + Logout */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm flex flex-wrap gap-6 items-center justify-between">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E8F5EE] flex items-center justify-center">
              <User className="h-4 w-4 text-[#2E8B57]" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-bold">Owner</p>
              <p className="text-sm font-semibold text-[#111827]">{metadata?.ownerName || "N/A"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E8F5EE] flex items-center justify-center">
              <Store className="h-4 w-4 text-[#2E8B57]" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-bold">Shop</p>
              <p className="text-sm font-semibold text-[#111827]">{metadata?.shopName || "N/A"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E8F5EE] flex items-center justify-center">
              <Mail className="h-4 w-4 text-[#2E8B57]" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-bold">Email</p>
              <p className="text-sm font-semibold text-[#111827]">{user?.emailAddresses[0]?.emailAddress || "N/A"}</p>
            </div>
          </div>
        </div>
        
        <div className="w-full sm:w-auto">
          <LogoutButton className="border border-red-100 py-2.5 px-4" />
        </div>
      </div>

      <PendingOrdersBanner count={stats.pendingOrders} />
      <StatsCards stats={stats} />

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
