"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { DashboardStats } from "@/types";

export interface AnalyticsData {
  revenue: { date: string; revenue: number; orders: number }[];
  statusBreakdown: { name: string; value: number; color: string }[];
  peakHours: { hour: string; orders: number }[];
  services: { name: string; count: number }[];
}

interface AnalyticsChartsProps {
  analyticsData: AnalyticsData;
  stats: DashboardStats;
}

const DATE_RANGES = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "This Month", value: "month" },
];

export default function AnalyticsCharts({ analyticsData, stats }: AnalyticsChartsProps) {
  const [dateRange, setDateRange] = useState("7d");

  const totalRevenue = analyticsData.revenue.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = analyticsData.revenue.reduce((s, r) => s + r.orders, 0);

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
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                dateRange === r.value
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
          { label: "Avg per Order", value: formatCurrency(totalRevenue / Math.max(totalOrders, 1)), emoji: "📊" },
          { label: "Avg Completion", value: `${stats.avgCompletionMins} min`, emoji: "⏱️" },
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
          <LineChart data={analyticsData.revenue}>
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
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
          <h2 className="text-lg font-bold text-[#111827] mb-4">Orders by Status</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={analyticsData.statusBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                label={({ name, value }) => `${name} ${value}%`}
                labelLine={false}
              >
                {analyticsData.statusBreakdown.map((entry, i) => (
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
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analyticsData.peakHours} barSize={16}>
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
              const rows = analyticsData.revenue.map(r => [r.date, r.orders, r.revenue]);
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
          {analyticsData.services.map((svc, i) => {
            const max = Math.max(...analyticsData.services.map((s) => s.count));
            const pct = (svc.count / max) * 100;
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
          })}
        </div>
      </div>

    </div>
  );
}
