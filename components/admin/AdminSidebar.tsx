"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  BarChart2,
  Settings,
  ShieldCheck
} from "lucide-react";

export function AdminSidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/shops", label: "Manage Shops", icon: Store },
    { href: "/admin/analytics", label: "Global Stats", icon: BarChart2 },
    { href: "/admin/settings", label: "Config", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#111827] text-white flex flex-col hidden md:flex">
      <div className="p-6 flex items-center gap-3 border-b border-gray-800">
        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="font-black tracking-tight text-lg leading-tight">SMARTPRINT</p>
          <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Super Admin</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 mt-4">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive 
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="font-semibold text-sm">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-6 border-t border-gray-800">
        <div className="bg-gray-800 rounded-2xl p-4">
          <p className="text-xs text-gray-400">System Status</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-sm font-bold">All Systems Operational</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
