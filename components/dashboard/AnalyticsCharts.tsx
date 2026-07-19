"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export interface RawOrder {
  total_amount: number | string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  customer_phone: string | null;
  is_color: boolean | null;
}

interface AnalyticsChartsProps {
  orders: RawOrder[];
}

const DATE_RANGES = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "This Month", value: "month" },
];

// Module-level constants — defined once, not recreated on each render
const STATUS_COLORS: Record<string, string> = {
  PLACED: "#3B82F6",
  ACCEPTED: "#8B5CF6",
  PRINTING: "#F59E0B",
  READY: "#10B981",
  COMPLETED: "#059669",
  CANCELLED: "#EF4444",
};

const toLocalDateString = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatChartDate = (dateStr: string) => {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
};

export default function AnalyticsCharts({ orders }: AnalyticsChartsProps) {
  const [dateRange, setDateRange] = useState("7d");

  // ── Date range boundaries (memoized) ─────────────────────────────────────
  const { startDate } = useMemo(() => {
    const now = new Date();
    let start = new Date();
    if (dateRange === "7d") {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (dateRange === "30d") {
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
    } else if (dateRange === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }
    return { startDate: start };
  }, [dateRange]);

  // ── Filtered orders (memoized) ────────────────────────────────────────────
  const filteredOrders = useMemo(
    () => orders.filter((o) => new Date(o.created_at) >= startDate),
    [orders, startDate]
  );

  const completedOrders = useMemo(
    () =>
      filteredOrders.filter((o) => {
        const s = o.status?.toUpperCase();
        return s === "COMPLETED" || s === "SUCCESS";
      }),
    [filteredOrders]
  );

  // ── Summary stats (memoized) ──────────────────────────────────────────────
  const { totalRevenue, totalOrders, avgOrderValue, avgCompletionMins } = useMemo(() => {
    const revenue = completedOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const aov = completedOrders.length > 0 ? revenue / completedOrders.length : 0;
    let totalMins = 0;
    let count = 0;
    for (const o of completedOrders) {
      const createdTime = new Date(o.created_at).getTime();
      const completedTime = o.completed_at
        ? new Date(o.completed_at).getTime()
        : new Date(o.updated_at).getTime();
      const diff = (completedTime - createdTime) / 60000;
      if (diff >= 0) { totalMins += diff; count++; }
    }
    return {
      totalRevenue: revenue,
      totalOrders: filteredOrders.length,
      avgOrderValue: aov,
      avgCompletionMins: count > 0 ? Math.round(totalMins / count) : 0,
    };
  }, [completedOrders, filteredOrders.length]);

  // ── Revenue trend (memoized) ──────────────────────────────────────────────
  const revenueTrend = useMemo(() => {
    const now = new Date();
    const datesList: string[] = [];
    const tempDate = new Date(startDate);
    const todayStr = toLocalDateString(now);
    while (toLocalDateString(tempDate) <= todayStr) {
      datesList.push(toLocalDateString(tempDate));
      tempDate.setDate(tempDate.getDate() + 1);
      if (datesList.length > 100) break;
    }
    const revenueByDate: Record<string, { revenue: number; orders: number }> = {};
    for (const d of datesList) revenueByDate[d] = { revenue: 0, orders: 0 };
    for (const o of filteredOrders) {
      const ds = toLocalDateString(new Date(o.created_at));
      if (revenueByDate[ds]) {
        revenueByDate[ds].orders++;
        const s = o.status?.toUpperCase();
        if (s === "COMPLETED" || s === "SUCCESS") revenueByDate[ds].revenue += Number(o.total_amount) || 0;
      }
    }
    return Object.entries(revenueByDate)
      .map(([ds, data]) => ({ date: formatChartDate(ds), revenue: data.revenue, orders: data.orders, rawDate: ds }))
      .sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  }, [filteredOrders, startDate]);

  // ── Status breakdown (memoized) ───────────────────────────────────────────
  const statusBreakdown = useMemo(() => {
    const statusCount: Record<string, number> = {
      PLACED: 0, ACCEPTED: 0, PRINTING: 0, READY: 0, COMPLETED: 0, CANCELLED: 0,
    };
    for (const o of filteredOrders) {
      const status = (o.status || "PLACED").toUpperCase();
      const chartStatus = status === "NEW" ? "PLACED" : status;
      if (statusCount[chartStatus] !== undefined) statusCount[chartStatus]++;
    }
    return Object.entries(statusCount)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        name: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase(),
        value: count,
        color: STATUS_COLORS[status] || "#9CA3AF",
      }));
  }, [filteredOrders]);

  // ── Peak hours (memoized) ─────────────────────────────────────────────────
  const peakHours = useMemo(() => {
    const peakHoursCount: Record<string, number> = {};
    for (const o of filteredOrders) {
      const hour = new Date(o.created_at).getHours();
      const hourStr = `${hour.toString().padStart(2, "0")}:00`;
      peakHoursCount[hourStr] = (peakHoursCount[hourStr] || 0) + 1;
    }
    return Object.entries(peakHoursCount)
      .map(([hour, count]) => ({ hour, orders: count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
  }, [filteredOrders]);

  // ── Top services (memoized) ───────────────────────────────────────────────
  const services = useMemo(() => {
    let bwCount = 0;
    let colorCount = 0;
    for (const o of filteredOrders) {
      if (o.is_color) colorCount++;
      else bwCount++;
    }
    return ([
      { name: "B&W Printing", count: bwCount },
      { name: "Color Printing", count: colorCount },
    ] as const)
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [filteredOrders]);

  return (
    <div className="space-y-6">
      {/* Header with date range */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Business Analytics</h1>
          <p className="text-sm text-[#6B7280]">Track your shop performance</p>
        </div>
        <div className="flex gap-1 bg-[#F3F4F6] rounded-xl p-1">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateRange === r.value
                  ? "bg-white text-[#111827] shadow-sm"
                  : "text-[#6B7280] hover:text-[#111827]"
                }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: formatCurrency(totalRevenue), emoji: "💰" },
          { label: "Total Orders", value: totalOrders.toString(), emoji: "📦" },
          { label: "Avg per Order", value: formatCurrency(avgOrderValue), emoji: "📊" },
          { label: "Avg Completion", value: `${avgCompletionMins} min`, emoji: "⏱️" },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <p className="text-2xl mb-1">{card.emoji}</p>
            <p className="text-xl font-black text-[#111827]">{card.value}</p>
            <p className="text-sm text-[#6B7280]">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Revenue line chart */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
        <h2 className="text-lg font-bold text-[#111827] mb-4">Revenue Trend</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={revenueTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#9CA3AF" }} />
            <YAxis tick={{ fontSize: 12, fill: "#9CA3AF" }} tickFormatter={(v) => `₹${v}`} />
            <Tooltip
              formatter={(val) => [formatCurrency(Number(val)), "Revenue"]}
              contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", fontSize: 13 }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#2E8B57"
              strokeWidth={2.5}
              dot={{ fill: "#2E8B57", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders by status pie */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 overflow-visible">
          <h2 className="text-lg font-bold text-[#111827] mb-4">Orders by Status</h2>
          <ResponsiveContainer width="100%" height={280} style={{ overflow: "visible" }}>
            <PieChart style={{ overflow: "visible" }} margin={{ top: 24, bottom: 24, left: 10, right: 10 }}>
              <Pie
                data={statusBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                labelLine={false}
                label={({ cx, cy, midAngle, outerRadius, name, value }) => {
                  const RADIAN = Math.PI / 180;
                  const radius = Number(outerRadius ?? 90) + 12;
                  const centerX = typeof cx === "number" ? cx : parseFloat(cx ?? "0");
                  const centerY = typeof cy === "number" ? cy : parseFloat(cy ?? "0");
                  const angle = midAngle ?? 0;
                  const x = centerX + radius * Math.cos(-angle * RADIAN);
                  const y = centerY + radius * Math.sin(-angle * RADIAN);
                  return (
                    <text
                      x={x}
                      y={y}
                      fill="#374151"
                      textAnchor={x > centerX ? "start" : "end"}
                      dominantBaseline="central"
                      className="text-xs font-semibold select-none"
                    >
                      {`${name} (${value})`}
                    </text>
                  );
                }}
              >
                {statusBreakdown.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Peak hours */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
          <h2 className="text-lg font-bold text-[#111827] mb-4">Peak Hours</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={peakHours} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", fontSize: 13 }} />
              <Bar dataKey="orders" fill="#2E8B57" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top services */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#111827]">Most Popular Services</h2>
          <button
            onClick={() => {
              const headers = ["Date", "Orders", "Revenue"];
              const rows = revenueTrend.map(r => [r.rawDate, r.orders, r.revenue]);
              const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
              const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
              const link = document.createElement("a");
              const url = URL.createObjectURL(blob);
              link.setAttribute("href", url);
              link.setAttribute("download", `analytics_export_${new Date().toISOString().split('T')[0]}.csv`);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="text-sm text-[#2E8B57] font-medium hover:text-[#1F6B42]"
          >
            Export CSV ↓
          </button>
        </div>
        <div className="space-y-3">
          {(() => {
            const maxServiceCount = Math.max(...services.map((s) => s.count), 1);
            return services.map((svc, i) => {
              const pct = (svc.count / maxServiceCount) * 100;
              return (
                <div key={svc.name} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-[#6B7280] w-4">{i + 1}</span>
                  <span className="text-sm font-medium text-[#374151] w-32 flex-shrink-0">{svc.name}</span>
                  <div className="flex-1 bg-[#F3F4F6] rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full bg-[#2E8B57] transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-[#111827] w-10 text-right">{svc.count}</span>
                </div>
              );
            });
          })()}
        </div>
      </div>

    </div>
  );
}
