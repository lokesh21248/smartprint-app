"use client";

import { useQuery } from "@tanstack/react-query";
import { StatsCards } from "./StatsCards";
import type { DashboardStats } from "@/types";

interface StatsSectionProps {
  initialStats: DashboardStats;
  shopId: string;
}

export function StatsSection({ initialStats, shopId }: StatsSectionProps) {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shop/stats?shopId=${shopId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json() as Promise<DashboardStats>;
    },
    initialData: initialStats,
    refetchInterval: 30000, // Poll every 30s as a fallback to realtime invalidation
    staleTime: 60000,
    gcTime: 300000,
  });

  return <StatsCards stats={stats || initialStats} />;
}
