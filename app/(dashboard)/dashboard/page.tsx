import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import type { Shop } from "@/types";
import { User as UserIcon, Store, Mail } from "lucide-react";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { getShopByUserId } from "@/lib/data/shop";
import { getDashboardInitialState, computeStatsFromOrders } from "@/lib/data/dashboard";
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

export default async function DashboardPage() {
  const start = Date.now();
  const { userId } = await auth();

  if (!userId) {
    return <div>Please log in.</div>;
  }

  // getShopByUserId is React.cache()-wrapped — free if layout already called it.
  const shop = await getShopByUserId(userId);
  if (!shop) {
    return <div>Shop not found. Please log in properly.</div>;
  }

  // getDashboardInitialState is React.cache()-memoized in lib/data/dashboard.ts.
  // The layout calls this first; this call returns the already-resolved result
  // with ZERO additional DB round-trips.
  const { orders, pendingOrders, pendingCount } = await getDashboardInitialState(shop.id);

  // Compute stats from the already-fetched 30-order sample — no extra DB queries.
  // StatsSection fetches accurate all-time stats client-side via /api/shop/stats
  // (Postgres RPC) after the initial render, so this is only the SSR placeholder.
  const stats = computeStatsFromOrders(orders);

  const ownerDisplayName = shop?.owner_name || "N/A";
  const shopDisplayName = shop?.name || "N/A";
  const emailDisplay = shop?.owner_email || "N/A";

  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] Dashboard page render: ${Date.now() - start} ms (0 extra DB queries)`);
  }

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

      <PendingOrdersBanner count={pendingCount} />
      {/* Seed the orderStore.pendingCount so the bell badge is correct immediately */}
      <PendingCountSeeder count={pendingCount} />

      <StatsSection initialStats={stats} shopId={shop.id} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <NewOrdersFeed initialOrders={pendingOrders} shopId={shop.id} />
        </div>
        <div>
          <QuickActions shop={shop as Shop} />
        </div>
      </div>
    </div>
  );
}
