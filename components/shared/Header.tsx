"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Bell, Menu, User, Settings, LogOut, Loader2, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";
import { useClerk } from "@clerk/nextjs";
import { toast } from "sonner";
import Link from "next/link";

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
  const { signOut } = useClerk();
  const title = useMemo(() => getPageTitle(pathname), [pathname]);
  const shopName = shop?.name || "Shop Owner";

  const greetingRef = useRef("Hello");
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    greetingRef.current = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    setMounted(true);
  }, []);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        avatarBtnRef.current &&
        !avatarBtnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut({ redirectUrl: "/login" });
    } catch {
      toast.error("Logout failed. Please try again.");
      setLoggingOut(false);
    }
  };

  const initials = shopName[0]?.toUpperCase() ?? "S";

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
                  {greetingRef.current}, {shopName} 👋
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

        {/* Avatar + Dropdown */}
        <div className="relative">
          <button
            ref={avatarBtnRef}
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center gap-1.5 h-9 pl-0.5 pr-2 rounded-full bg-gradient-to-br from-emerald-600 to-slate-800 text-white font-bold shadow-sm cursor-pointer select-none hover:opacity-95 active:scale-95 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 border border-emerald-500/20"
            aria-label={`User menu — ${shopName}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            id="user-menu-button"
          >
            <span className="h-8 w-8 rounded-full flex items-center justify-center text-xs tracking-wider">
              {initials}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 opacity-70 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          {/* Dropdown panel */}
          {menuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-labelledby="user-menu-button"
              className="absolute right-0 top-[calc(100%+8px)] w-52 bg-white rounded-2xl shadow-xl border border-slate-100/80 overflow-hidden z-50 animate-fade-in"
            >
              {/* User info header */}
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                <p className="text-xs font-black text-slate-800 truncate">{shopName}</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Shop Owner</p>
              </div>

              {/* Menu items */}
              <div className="p-1.5 space-y-0.5">
                <Link
                  href="/profile"
                  role="menuitem"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-150 group"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-emerald-100 transition-colors">
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  Profile
                </Link>

                <Link
                  href="/settings"
                  role="menuitem"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all duration-150 group"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-slate-200 transition-colors">
                    <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  Settings
                </Link>
              </div>

              {/* Logout — visually separated */}
              <div className="p-1.5 border-t border-slate-100">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 group-hover:bg-rose-100 transition-colors">
                    {loggingOut ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </span>
                  {loggingOut ? "Signing out…" : "Logout"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
