"use client";

import { useState, useEffect } from "react";
import { Bell, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/orders": "Orders",
  "/shop-profile": "My Shop",
  "/analytics": "Analytics",
  "/staff": "Staff",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/orders/")) return "Order Details";
  return pageTitles[pathname] ?? "SmartPrint";
}

export function Header() {
  const pathname = usePathname();
  const { shop, notificationCount } = useShopStore();
  const { pendingCount } = useOrderStore();
  const title = getPageTitle(pathname);
  const shopName = shop?.name || "Shop Owner";

  const [greeting, setGreeting] = useState("Hello");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  }, []);

  return (
    <header className="sticky top-0 z-30 h-[64px] bg-white/95 backdrop-blur-sm border-b border-[#E5E7EB] flex items-center justify-between px-6 gap-4">
      {/* Left: Title + Greeting */}
      <div>
        <h1 className="text-xl font-bold text-[#111827] leading-tight">{title}</h1>
        {pathname === "/dashboard" && (
          <p className="text-xs text-[#6B7280]">
            {mounted ? `${greeting}, ${shopName} 👋` : "Loading..."}
          </p>
        )}
      </div>

      {/* Right: Search hint + Notification Bell + Avatar */}
      <div className="flex items-center gap-3">
        {/* Quick search hint — keyboard shortcut */}
        <div className="hidden md:flex items-center gap-2 bg-[#F3F4F6] rounded-lg px-3 py-2 text-sm text-[#9CA3AF] cursor-pointer hover:bg-[#E5E7EB] transition-colors">
          <Search className="h-4 w-4" />
          <span>Search orders…</span>
          <kbd className="ml-2 rounded bg-white border border-[#E5E7EB] px-1.5 py-0.5 text-[10px] font-mono text-[#6B7280]">
            ⌘K
          </kbd>
        </div>

        {/* Notification Bell */}
        <button
          className="relative p-2.5 rounded-xl text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] transition-colors min-tap flex items-center justify-center"
          aria-label={`${pendingCount + notificationCount} notifications`}
        >
          <Bell className="h-5 w-5" />
          {pendingCount + notificationCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white animate-pulse-ring">
              {Math.min(pendingCount + notificationCount, 99)}
            </span>
          )}
        </button>

        {/* Avatar */}
        <div
          className="h-9 w-9 rounded-full bg-gradient-to-br from-[#2E8B57] to-[#1F4E79] flex items-center justify-center text-white font-semibold text-sm cursor-pointer select-none"
          aria-label="User menu"
        >
          {shopName[0]?.toUpperCase() ?? "S"}
        </div>
      </div>
    </header>
  );
}
