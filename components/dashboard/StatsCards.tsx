"use client";

import { TrendingUp, ShoppingBag, IndianRupee, Clock, Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { DashboardStats } from "@/types";

interface StatsCardsProps {
  stats: DashboardStats;
}

const cards = (stats: DashboardStats) => [
  {
    id: "orders-today",
    label: "Orders Today",
    value: stats.ordersToday.toString(),
    icon: ShoppingBag,
    color: "bg-blue-50 text-blue-600",
    iconBg: "bg-blue-100",
    change: "today's orders",
    positive: true,
  },
  {
    id: "revenue-today",
    label: "Revenue Today",
    value: formatCurrency(stats.revenueToday),
    icon: IndianRupee,
    color: "bg-green-50 text-green-700",
    iconBg: "bg-green-100",
    change: `${stats.completedToday} orders completed`,
    positive: true,
  },
  {
    id: "avg-time",
    label: "Avg Completion",
    value: `${stats.avgCompletionMins} min`,
    icon: Clock,
    color: "bg-orange-50 text-orange-600",
    iconBg: "bg-orange-100",
    change: "per order",
    positive: stats.avgCompletionMins <= 30,
  },
  {
    id: "active-customers",
    label: "Active Customers",
    value: stats.activeCustomers.toString(),
    icon: Users,
    color: "bg-purple-50 text-purple-600",
    iconBg: "bg-purple-100",
    change: "unique today",
    positive: true,
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards(stats).map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            id={card.id}
            className="bg-white rounded-2xl border border-[#E5E7EB] p-5 card-hover"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <Icon className={`h-5 w-5 ${card.color.split(" ")[1]}`} />
              </div>
              <TrendingUp
                className={`h-4 w-4 ${card.positive ? "text-[#10B981]" : "text-[#F59E0B]"}`}
              />
            </div>
            <p className="text-2xl font-bold text-[#111827] mt-2 animate-count-up">
              {card.value}
            </p>
            <p className="text-sm text-[#6B7280] mt-1 font-medium">{card.label}</p>
            <p className={`text-xs mt-1 ${card.positive ? "text-[#10B981]" : "text-[#F59E0B]"}`}>
              {card.change}
            </p>
          </div>
        );
      })}
    </div>
  );
}
