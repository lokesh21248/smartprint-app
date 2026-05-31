"use client";

import { useState, useEffect } from "react";
import { Bell, Search, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/orders": "Orders",
  "/dashboard/shop-profile": "My Shop",
  "/dashboard/analytics": "Analytics",
  "/dashboard/staff": "Staff",
  "/dashboard/settings": "Settings",
  "/shop-profile": "My Shop",
  "/analytics": "Analytics",
  "/staff": "Staff",
  "/settings": "Settings",
  "/profile": "Profile",
};

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard/orders/")) return "Order Details";
  return pageTitles[pathname] ?? "Scan2Paper";
}

/** Dispatch a custom event that Sidebar listens to for mobile open */
function openMobileSidebar() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("open-mobile-sidebar"));
  }
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
    setGreeting(
      hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
    );
  }, []);

  return (
    <header className="sticky top-0 z-30 h-[64px] bg-white/95 backdrop-blur-sm border-b border-[#E5E7EB] flex items-center justify-between px-4 md:px-6 gap-4">
      {/* Left: Hamburger (mobile) + Title + Greeting */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger button */}
        <button
          type="button"
          onClick={openMobileSidebar}
          className="md:hidden flex-shrink-0 p-2 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] transition-colors"
          aria-label="Open navigation menu"
          aria-haspopup="true"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-bold text-[#111827] leading-tight truncate">
            {title}
          </h1>
          {pathname === "/dashboard" && (
            <p className="text-xs text-[#6B7280] truncate">
              {mounted ? `${greeting}, ${shopName} 👋` : "Loading..."}
            </p>
          )}
        </div>
      </div>

      {/* Right: Search hint + Notification Bell + Avatar */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* Quick search hint — hidden on small screens */}
        <div
          className="hidden md:flex items-center gap-2 bg-[#F3F4F6] rounded-lg px-3 py-2 text-sm text-[#9CA3AF] cursor-pointer hover:bg-[#E5E7EB] transition-colors"
          role="button"
          tabIndex={0}
          aria-label="Search orders"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span>Search orders…</span>
          <kbd className="ml-2 rounded bg-white border border-[#E5E7EB] px-1.5 py-0.5 text-[10px] font-mono text-[#6B7280]">
            ⌘K
          </kbd>
        </div>

        {/* Notification Bell */}
        <button
          type="button"
          className="relative p-2.5 rounded-xl text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] transition-colors min-tap flex items-center justify-center"
          aria-label={
            pendingCount + notificationCount > 0
              ? `${pendingCount + notificationCount} notifications`
              : "Notifications — no new items"
          }
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {pendingCount + notificationCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white animate-pulse-ring"
              aria-hidden="true"
            >
              {Math.min(pendingCount + notificationCount, 99)}
            </span>
          )}
        </button>

        {/* Avatar — accessible button */}
        <button
          type="button"
          className="h-9 w-9 rounded-full bg-gradient-to-br from-[#2E8B57] to-[#1F4E79] flex items-center justify-center text-white font-semibold text-sm cursor-pointer select-none hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-[#2E8B57] focus-visible:ring-offset-2"
          aria-label={`User menu — ${shopName}`}
          aria-expanded="false"
        >
          {shopName[0]?.toUpperCase() ?? "S"}
        </button>
      </div>
    </header>
  );
}
