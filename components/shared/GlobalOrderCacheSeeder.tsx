"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrderStore } from "@/stores/orderStore";
import { markOrdersAsKnown } from "@/components/shared/GlobalNotificationProvider";
import { markNotificationsAsSeen } from "@/components/shared/GlobalNewOrderNotification";
import type { Order } from "@/types";

interface GlobalOrderCacheSeedProps {
  shopId: string | null;
  /** All orders fetched server-side (for seeding the full orders list cache) */
  initialOrders: Order[];
  /** Pending/placed orders only (for seeding the new-orders feed cache) */
  initialNewOrders: Order[];
  /** Pending count to hydrate the bell badge immediately */
  pendingCount: number;
}

export function GlobalOrderCacheSeeder({
  shopId,
  initialOrders,
  initialNewOrders,
  pendingCount,
}: GlobalOrderCacheSeedProps) {
  const queryClient = useQueryClient();
  const setOrders = useOrderStore((s) => s.setOrders);
  const setPendingCount = useOrderStore((s) => s.setPendingCount);

  useEffect(() => {
    if (!shopId) return;

    // 1. Mark existing initial orders as already known and seen so they never trigger false alerts
    if (initialOrders.length > 0) {
      const ids = initialOrders.map((o) => o.id);
      markOrdersAsKnown(ids);
      markNotificationsAsSeen(ids);
    }

    // 2. Hydrate the centralized Zustand orderStore
    setOrders(initialOrders);

    // 3. Seed React Query caches
    const existingOrders = queryClient.getQueryData<Order[]>(["orders", shopId]);
    if (!existingOrders || existingOrders.length === 0) {
      queryClient.setQueryData<Order[]>(["orders", shopId], initialOrders);
    }

    const existingNew = queryClient.getQueryData<Order[]>(["new-orders", shopId]);
    if (!existingNew || existingNew.length === 0) {
      queryClient.setQueryData<Order[]>(["new-orders", shopId], initialNewOrders);
    }

    setPendingCount(pendingCount);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  return null;
}
