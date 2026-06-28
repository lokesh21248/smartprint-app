"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Store,
  BarChart3,
  Users,
  Settings,
  Bell,
  ChevronLeft,
  ChevronRight,
  User,
  X,
} from "lucide-react";
import { Scan2PaperLogo } from "@/components/shared/Scan2PaperLogo";
import { cn } from "@/lib/utils";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";

const SIDEBAR_FULL_W = 256;
const SIDEBAR_COLLAPSED_W = 68;

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/orders", label: "Orders", icon: ShoppingBag, badge: true },
  { href: "/shop-profile", label: "My Shop", icon: Store },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Update the CSS variable used by the content area margin */
function setSidebarWidthVar(width: number) {
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--sidebar-w", `${width}px`);
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const { shop, toggleShopOpen } = useShopStore();
  const { pendingCount } = useOrderStore();

  const [collapsed, setCollapsed] = useState(false);
  const [toggling, setToggling] = useState(false);
  // Mobile drawer open state — controlled by "open-mobile-sidebar" custom event from Header
  const [mobileOpen, setMobileOpen] = useState(false);

  const shopName = shop?.name || "Shop Panel";

  // Sync --sidebar-w CSS variable whenever collapsed state changes
  useEffect(() => {
    setSidebarWidthVar(collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_FULL_W);
  }, [collapsed]);

  // Initial set on mount
  useEffect(() => {
    setSidebarWidthVar(SIDEBAR_FULL_W);
  }, []);

  // Listen for mobile sidebar open events dispatched by the Header hamburger button
  useEffect(() => {
    const handler = () => setMobileOpen(true);
    window.addEventListener("open-mobile-sidebar", handler);
    return () => window.removeEventListener("open-mobile-sidebar", handler);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleToggleOpen = async () => {
    setToggling(true);
    try {
      const res = await fetch("/api/shop/toggle-open", { method: "POST" });
      if (res.ok) {
        toggleShopOpen();
        toast.success(
          shop?.is_open ? "Shop is now closed" : "Shop is now open"
        );
      }
    } finally {
      setToggling(false);
    }
  };

  const handleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const renderNavItems = (isMobile = false) => {
    const isCollapsed = !isMobile && collapsed;
    return navItems.map((item) => {
      const isActive =
        pathname === item.href ||
        (item.href !== "/dashboard" && pathname.startsWith(item.href));
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "sidebar-link",
            isActive && "active",
            isCollapsed && "justify-center px-0"
          )}
          title={isCollapsed ? item.label : undefined}
          aria-current={isActive ? "page" : undefined}
        >
          <div className="relative flex-shrink-0">
            <Icon className="h-5 w-5" aria-hidden="true" />
            {item.badge && pendingCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white"
                aria-label={!isMobile && isCollapsed ? `${pendingCount} pending orders` : undefined}
              >
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </div>
          {!isCollapsed && <span>{item.label}</span>}
          {!isCollapsed && item.badge && pendingCount > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FEE2E2] px-1 text-[11px] font-bold text-[#B91C1C]">
              {pendingCount}
            </span>
          )}
        </Link>
      );
    });
  };

  const sidebarContent = (
    <aside
      className={cn(
        "h-full bg-white border-r border-slate-100 z-40 flex flex-col transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[256px]"
      )}
      aria-label="Dashboard navigation"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 h-[64px] border-b border-slate-100 flex-shrink-0">
        {collapsed ? (
          /* Collapsed: icon only */
          <Scan2PaperLogo variant="icon" size={34} color="color" className="mx-auto" />
        ) : (
          /* Expanded: icon + wordmark side by side */
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Scan2PaperLogo variant="icon" size={34} color="color" />
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-sm text-slate-800 tracking-tight leading-tight">Scan2Paper</p>
              <p className="text-[10px] text-slate-400 font-bold truncate leading-normal">{shopName}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleCollapse}
          className="flex-shrink-0 p-1.5 rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#374151] transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Open/Closed Toggle */}
      {!collapsed && (
        <div className="mx-3 mt-3 p-3.5 rounded-xl bg-slate-50/50 border border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Shop Status</p>
              <p
                className={cn(
                  "text-xs font-extrabold mt-1.5 flex items-center gap-1.5",
                  shop?.is_open ? "text-emerald-700" : "text-rose-600"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", shop?.is_open ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
                {shop?.is_open ? "Open Now" : "Closed"}
              </p>
            </div>
            <Switch
              checked={shop?.is_open ?? true}
              onCheckedChange={handleToggleOpen}
              disabled={toggling}
              aria-label="Toggle shop open/closed"
            />
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto mt-2" aria-label="Main navigation">
        {renderNavItems(false)}
      </nav>

      {/* Bottom: Notifications */}
      <div className="p-3 space-y-1 border-t border-[#E5E7EB] flex-shrink-0">
        <Link
          href="/settings"
          className={cn(
            "sidebar-link",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? "Notifications" : undefined}
        >
          <div className="relative flex-shrink-0">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </div>
          {!collapsed && <span>Notifications</span>}
        </Link>
      </div>
    </aside>
  );

  return (
    <>
      {/* ── Desktop sidebar (md and up): fixed position ─────────────── */}
      <div className="hidden md:block fixed left-0 top-0 h-full z-40">
        {sidebarContent}
      </div>

      {/* ── Mobile drawer overlay (below md) ───────────────────────── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="fixed left-0 top-0 h-full z-50 md:hidden animate-slide-in-left">
            <div className="relative h-full">
              {/* Close button */}
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#374151] transition-colors z-10"
                aria-label="Close navigation menu"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              {/* Full sidebar (never collapsed on mobile) */}
              <aside
                className="h-full bg-white border-r border-[#E5E7EB] flex flex-col w-[256px]"
                aria-label="Mobile navigation"
              >
                {/* Logo */}
                <div className="flex items-center gap-2 px-3 h-[64px] border-b border-[#E5E7EB] flex-shrink-0">
                  <Scan2PaperLogo variant="icon" size={34} color="color" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[15px] text-[#111827] truncate leading-tight">Scan2Paper</p>
                    <p className="text-[11px] text-[#6B7280] truncate">{shopName}</p>
                  </div>
                </div>

                {/* Shop toggle */}
                <div className="mx-3 mt-3 p-3 rounded-xl bg-[#FAFAFA] border border-[#E5E7EB] flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-[#374151]">Shop Status</p>
                      <p className={cn("text-xs font-medium", shop?.is_open ? "text-[#2E8B57]" : "text-[#EF4444]")}>
                        {shop?.is_open ? "🟢 Open" : "🔴 Closed"}
                      </p>
                    </div>
                    <Switch
                      checked={shop?.is_open ?? true}
                      onCheckedChange={handleToggleOpen}
                      disabled={toggling}
                      aria-label="Toggle shop open/closed"
                    />
                  </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto mt-2" aria-label="Mobile main navigation">
                  {renderNavItems(true)}
                </nav>

                {/* Bottom */}
                <div className="p-3 space-y-1 border-t border-[#E5E7EB] flex-shrink-0">
                  <Link href="/settings" className="sidebar-link">
                    <Bell className="h-5 w-5" aria-hidden="true" />
                    <span>Notifications</span>
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </>
      )}
    </>
  );
}
