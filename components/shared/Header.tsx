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
    <header className="sticky top-0 z-30 h-[64px] bg-white/70 backdrop-blur-md border-b border-slate-100/80 flex items-center justify-between px-4 md:px-6 gap-4">
      {/* Left: Hamburger (mobile) + Title + Greeting */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger button */}
        <button
          type="button"
          onClick={openMobileSidebar}
          className="md:hidden flex-shrink-0 p-2 rounded-xl text-slate-500 border border-slate-100 hover:bg-slate-50/50 hover:text-slate-800 transition-all duration-200"
          aria-label="Open navigation menu"
          aria-haspopup="true"
        >
          <Menu className="h-4.5 w-4.5" aria-hidden="true" />
        </button>

        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-extrabold text-slate-800 tracking-tight leading-tight truncate">
            {title}
          </h1>
          {pathname === "/dashboard" && (
            <div className="h-4 flex items-center mt-0.5">
              {mounted ? (
                <p className="text-[11px] font-bold text-slate-400 truncate animate-fade-in leading-none">
                  {greeting}, {shopName} 👋
                </p>
              ) : (
                <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Search hint + Notification Bell + Avatar */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* Quick search hint — hidden on small screens */}
        <div
          className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-400 cursor-pointer hover:bg-slate-100/80 transition-all duration-200"
          role="button"
          tabIndex={0}
          aria-label="Search orders"
        >
          <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <span>Search orders…</span>
          <kbd className="ml-2 rounded bg-white border border-slate-200/60 shadow-[0_1px_1px_rgba(0,0,0,0.03)] px-1.5 py-0.5 text-[9px] font-mono text-slate-400">
            ⌘K
          </kbd>
        </div>

        {/* Notification Bell */}
        <button
          type="button"
          className="relative p-2.5 rounded-xl text-slate-500 border border-transparent hover:border-slate-100 hover:bg-slate-50/50 hover:text-slate-850 transition-all duration-200 min-tap flex items-center justify-center"
          aria-label={
            pendingCount + notificationCount > 0
              ? `${pendingCount + notificationCount} notifications`
              : "Notifications — no new items"
          }
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {pendingCount + notificationCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white animate-pulse-ring shadow-sm"
              aria-hidden="true"
            >
              {Math.min(pendingCount + notificationCount, 99)}
            </span>
          )}
        </button>

        {/* Avatar — accessible button */}
        <button
          type="button"
          className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-600 to-slate-800 flex items-center justify-center text-white font-bold text-xs tracking-wider shadow-sm cursor-pointer select-none hover:opacity-95 active:scale-95 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 border border-emerald-500/20"
          aria-label={`User menu — ${shopName}`}
          aria-expanded="false"
        >
          {shopName[0]?.toUpperCase() ?? "S"}
        </button>
      </div>
    </header>
  );
}
