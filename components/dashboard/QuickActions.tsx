"use client";

import Link from "next/link";
import { ShoppingBag, Store, BarChart3, Settings, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShopStore } from "@/stores/shopStore";
import { toast } from "sonner";
import { useState } from "react";
import type { Shop } from "@/types";

interface QuickActionsProps {
  shop: Shop;
}

export function QuickActions({ shop: initialShop }: QuickActionsProps) {
  const { shop, toggleShopOpen } = useShopStore();
  const currentShop = shop ?? initialShop;
  const [toggling, setToggling] = useState(false);
  const shopRecord = currentShop as unknown as {
    name?: string;
    shop_name?: string;
    city?: string;
    state?: string;
    address?: string;
    rating_avg?: number;
    total_orders?: number;
  };
  const shopName = shopRecord.shop_name || shopRecord.name || "My Shop";
  const shopLocation =
    [shopRecord.city, shopRecord.state].filter(Boolean).join(", ") ||
    shopRecord.address ||
    "Location not set";
  const rating = typeof shopRecord.rating_avg === "number" ? shopRecord.rating_avg.toFixed(1) : "N/A";
  const totalOrders = typeof shopRecord.total_orders === "number" ? shopRecord.total_orders : 0;

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
        <Link href="/orders">
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
      <div className="p-3 bg-[#FAFAFA] rounded-xl border border-[#E5E7EB] text-sm">
        <p className="font-semibold text-[#374151]">{shopName}</p>
        <p className="text-[#6B7280] text-xs mt-0.5">{shopLocation}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-[#6B7280]">
          <span>⭐ {rating}</span>
          <span>📦 {totalOrders} orders</span>
        </div>
      </div>
    </div>
  );
}
