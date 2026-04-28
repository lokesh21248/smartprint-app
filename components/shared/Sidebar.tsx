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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";
import { toast } from "sonner";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { LogoutButton } from "@/components/auth/LogoutButton";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingBag, badge: true },
  { href: "/shop-profile", label: "My Shop", icon: Store },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { shop, toggleShopOpen } = useShopStore();
  const { pendingCount } = useOrderStore();
  const [collapsed, setCollapsed] = useState(false);
  const [toggling, setToggling] = useState(false);
  const shopName =
    (shop as unknown as { shop_name?: string; name?: string } | null)?.shop_name ||
    (shop as unknown as { shop_name?: string; name?: string } | null)?.name ||
    "Shop Panel";

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

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full bg-white border-r border-[#E5E7EB] z-40 flex flex-col transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[256px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-[64px] border-b border-[#E5E7EB]">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#2E8B57] flex items-center justify-center">
          <Printer className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] text-[#111827] truncate">SmartPrint</p>
            <p className="text-[11px] text-[#6B7280] truncate">
              {shopName}
            </p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex-shrink-0 p-1.5 rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#374151] transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Open/Closed Toggle */}
      {!collapsed && (
        <div className="mx-3 mt-3 p-3 rounded-xl bg-[#FAFAFA] border border-[#E5E7EB]">
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
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto mt-2">
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
            >
              <div className="relative flex-shrink-0">
                <Icon className="h-5 w-5" />
                {item.badge && pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white">
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
      <div className="p-3 space-y-1 border-t border-[#E5E7EB]">
        <Link
          href="/settings"
          className={cn(
            "sidebar-link",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? "Notifications" : undefined}
        >
          <div className="relative flex-shrink-0">
            <Bell className="h-5 w-5" />
          </div>
          {!collapsed && <span>Notifications</span>}
        </Link>
        <LogoutButton showText={!collapsed} />
      </div>
    </aside>
  );
}
