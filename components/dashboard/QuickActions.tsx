"use client";

import Link from "next/link";
import { ShoppingBag, Store, BarChart3, Settings, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShopStore } from "@/stores/shopStore";
import { toast } from "sonner";
import { useState } from "react";
import type { Shop } from "@/types";
import { useQuery } from "@tanstack/react-query";

interface QuickActionsProps {
  shop: Shop;
}

export function QuickActions({ shop: initialShop }: QuickActionsProps) {
  const { shop, toggleShopOpen } = useShopStore();
  const currentShop = shop ?? initialShop;
  const [toggling, setToggling] = useState(false);

  const { data: statsData, isLoading, error } = useQuery({
    queryKey: ["dashboard-stats", currentShop.id],
    queryFn: async () => {
      const res = await fetch(`/api/shop/stats?shopId=${currentShop.id}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json() as Promise<{
        location: string;
        rating: number;
        order_count: number;
        shop_name?: string;
      }>;
    },
    refetchInterval: 30000,
    staleTime: 60000,
  });

  const shopName = currentShop.name || statsData?.shop_name || "My Shop";

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await fetch("/api/shop/toggle-open", { method: "POST" });
      if (res.ok) {
        toggleShopOpen();
        toast.success(
          currentShop.is_open
            ? "🔴 Shop is now closed"
            : "🟢 Shop is now open"
        );
      } else {
        toast.error("Failed to update status");
      }
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 space-y-4">
      <h2 className="text-lg font-bold text-[#111827]">Quick Actions</h2>

      {/* Shop open/close — primary action */}
      <button
        id="toggle-shop-btn"
        onClick={handleToggle}
        disabled={toggling}
        className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all font-semibold text-base ${
          currentShop.is_open
            ? "border-[#EF4444] bg-[#FEE2E2] text-[#B91C1C] hover:bg-[#FCA5A5]/30"
            : "border-[#2E8B57] bg-[#E8F5EE] text-[#1F6B42] hover:bg-[#B6DEC9]/30"
        }`}
      >
        <Power className="h-5 w-5" />
        <div className="text-left">
          <p>{currentShop.is_open ? "Close Shop" : "Open Shop"}</p>
          <p className="text-xs font-normal opacity-70 mt-0.5">
            Currently: {currentShop.is_open ? "🟢 Open" : "🔴 Closed"}
          </p>
        </div>
      </button>

      {/* Other quick links */}
      <div className="grid grid-cols-1 gap-2">
        <Link href="/dashboard/orders">
          <Button
            id="view-all-orders-btn"
            variant="secondary"
            className="w-full justify-start gap-3 h-12"
          >
            <ShoppingBag className="h-5 w-5" />
            View All Orders
          </Button>
        </Link>
        <Link href="/shop-profile">
          <Button
            id="edit-shop-btn"
            variant="secondary"
            className="w-full justify-start gap-3 h-12"
          >
            <Store className="h-5 w-5" />
            Edit Shop Profile
          </Button>
        </Link>
        <Link href="/analytics">
          <Button
            id="analytics-btn"
            variant="secondary"
            className="w-full justify-start gap-3 h-12"
          >
            <BarChart3 className="h-5 w-5" />
            View Analytics
          </Button>
        </Link>
        <Link href="/settings">
          <Button
            id="settings-btn"
            variant="secondary"
            className="w-full justify-start gap-3 h-12"
          >
            <Settings className="h-5 w-5" />
            Settings
          </Button>
        </Link>
      </div>

      {/* Shop info snippet */}
      {isLoading ? (
        <div className="p-3 bg-[#FAFAFA] rounded-xl border border-[#E5E7EB] text-sm animate-pulse space-y-2">
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
          <div className="h-3 bg-slate-100 rounded w-1/2"></div>
          <div className="flex items-center gap-3 mt-2">
            <div className="h-3 bg-slate-100 rounded w-12"></div>
            <div className="h-3 bg-slate-100 rounded w-16"></div>
          </div>
        </div>
      ) : error ? (
        <div className="p-3 bg-red-50 text-red-800 rounded-xl border border-red-100 text-sm">
          <p className="font-semibold">Failed to load shop info</p>
          <p className="text-xs mt-0.5">Please check your connection and try again.</p>
        </div>
      ) : (
        <div className="p-3 bg-[#FAFAFA] rounded-xl border border-[#E5E7EB] text-sm">
          <p className="font-semibold text-[#374151]">{shopName}</p>
          {!statsData?.location ? (
            <Link
              href="/shop-profile"
              className="text-emerald-700 hover:text-emerald-800 font-semibold underline text-xs block mt-0.5"
            >
              Add location in Shop Profile
            </Link>
          ) : (
            <p className="text-[#6B7280] text-xs mt-0.5">{statsData.location}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-[#6B7280]">
            <span>
              {statsData?.rating && statsData.rating > 0
                ? `⭐ ${statsData.rating.toFixed(1)}`
                : "0.0 ★"}
            </span>
            <span>📦 {statsData?.order_count ?? 0} orders</span>
          </div>
        </div>
      )}
    </div>
  );
}
