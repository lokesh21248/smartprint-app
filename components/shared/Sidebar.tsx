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
  Printer,
  Bell,
  ChevronLeft,
  ChevronRight,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { LogoutButton } from "@/components/auth/LogoutButton";

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

  const sidebarContent = (
    <aside
      className={cn(
        "h-full bg-white border-r border-[#E5E7EB] z-40 flex flex-col transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[256px]"
      )}
      aria-label="Dashboard navigation"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-[64px] border-b border-[#E5E7EB] flex-shrink-0">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#2E8B57] flex items-center justify-center">
          <Printer className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] text-[#111827] truncate">SmartPrint</p>
            <p className="text-[11px] text-[#6B7280] truncate">{shopName}</p>
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
        <div className="mx-3 mt-3 p-3 rounded-xl bg-[#FAFAFA] border border-[#E5E7EB] flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-[#374151]">Shop Status</p>
              <p
                className={cn(
                  "text-xs font-medium",
                  shop?.is_open ? "text-[#2E8B57]" : "text-[#EF4444]"
                )}
              >
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
      )}

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto mt-2" aria-label="Main navigation">
        {navItems.map((item) => {
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
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative flex-shrink-0">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.badge && pendingCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white"
                    aria-label={`${pendingCount} pending orders`}
                  >
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </div>
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge && pendingCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FEE2E2] px-1 text-[11px] font-bold text-[#B91C1C]">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Notifications + Logout */}
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
        <LogoutButton showText={!collapsed} />
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
                <div className="flex items-center gap-3 px-4 h-[64px] border-b border-[#E5E7EB] flex-shrink-0">
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#2E8B57] flex items-center justify-center">
                    <Printer className="h-5 w-5 text-white" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[15px] text-[#111827] truncate">SmartPrint</p>
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
                  {navItems.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" && pathname.startsWith(item.href));
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn("sidebar-link", isActive && "active")}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <div className="relative flex-shrink-0">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                          {item.badge && pendingCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white">
                              {pendingCount > 9 ? "9+" : pendingCount}
                            </span>
                          )}
                        </div>
                        <span>{item.label}</span>
                        {item.badge && pendingCount > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FEE2E2] px-1 text-[11px] font-bold text-[#B91C1C]">
                            {pendingCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>

                {/* Bottom */}
                <div className="p-3 space-y-1 border-t border-[#E5E7EB] flex-shrink-0">
                  <Link href="/settings" className="sidebar-link">
                    <Bell className="h-5 w-5" aria-hidden="true" />
                    <span>Notifications</span>
                  </Link>
                  <LogoutButton showText />
                </div>
              </aside>
            </div>
          </div>
        </>
      )}
    </>
  );
}
