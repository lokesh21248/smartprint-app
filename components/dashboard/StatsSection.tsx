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
    // Realtime subscriptions invalidate stats on every INSERT/UPDATE.
    // 120s is a safety-net for reconnection scenarios only.
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    gcTime: 300_000,
  });

  return <StatsCards stats={stats || initialStats} />;
}
