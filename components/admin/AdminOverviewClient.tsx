"use client";

import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from "recharts";
import { 
  Store, 
  ShoppingBag, 
  IndianRupee, 
  Users,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { Order } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface AdminOverviewClientProps {
  stats: {
    totalRevenue: number;
    activeShops: number;
    totalOrders: number;
  };
  latestOrders: Partial<Order>[];
  chartData: { day: string; revenue: number; orders: number }[];
}

export function AdminOverviewClient({ stats, latestOrders, chartData }: AdminOverviewClientProps) {

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Platform Overview</h1>
        <p className="text-gray-500 mt-1">Global performance and system health</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Total Revenue", value: formatCurrency(stats.totalRevenue), icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-50", trend: "+12.5%", positive: true },
          { label: "Active Shops", value: stats.activeShops, icon: Store, color: "text-blue-600", bg: "bg-blue-50", trend: "+2", positive: true },
          { label: "Total Orders", value: stats.totalOrders, icon: ShoppingBag, color: "text-orange-600", bg: "bg-orange-50", trend: "+8.2%", positive: true },
          { label: "Platform Users", value: "1,240", icon: Users, color: "text-purple-600", bg: "bg-purple-50", trend: "+5.1%", positive: true },
        ].map((item, i) => (
          <div key={i} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 rounded-2xl ${item.bg} flex items-center justify-center`}>
                <item.icon className={`h-6 w-6 ${item.color}`} />
              </div>
              <div className={`flex items-center gap-1 text-xs font-bold ${item.positive ? "text-emerald-600" : "text-red-600"}`}>
                {item.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {item.trend}
              </div>
            </div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{item.label}</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-gray-900">Revenue Trends</h3>
            <select className="bg-gray-50 border-none rounded-lg text-xs font-bold px-3 py-2 outline-none">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                <Tooltip 
                  contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#10b981" 
                  strokeWidth={4} 
                  dot={{ r: 4, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-6">Recent Activity</h3>
          <div className="space-y-6">
            {(latestOrders.slice(0, 10).map((o, index) => {
              const isNew = o.status === "PLACED";
              return {
                type: isNew ? "shop" : "order",
                text: isNew ? `New order #${o.short_token} from ${o.customer_name || 'Guest'}` : `Order #${o.short_token} updated to ${o.status}`,
                time: new Date(o.created_at).toLocaleString(),
                color: isNew ? "bg-blue-500" : "bg-emerald-500",
                id: o.id + index,
              };
            })).map((item, i, arr) => (
              <div key={item.id} className="flex gap-4">
                <div className="relative">
                  <div className={`w-2.5 h-2.5 rounded-full ${item.color} mt-1.5`} />
                  {i < arr.length - 1 && <div className="absolute top-4 left-1 w-[1px] h-10 bg-gray-100" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{item.text}</p>
                  <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-tighter" suppressHydrationWarning>{item.time}</p>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-8 py-3 bg-gray-50 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors">
            View All Logs
          </button>
        </div>
      </div>
    </div>
  );
}
