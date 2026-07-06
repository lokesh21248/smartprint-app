"use client";

import { useEffect } from "react";
import { useOrderStore } from "@/stores/orderStore";

/**
 * PendingCountSeeder
 *
 * Seeds the Zustand orderStore.pendingCount with the SSR-fetched value
 * so the bell badge in the Header and sidebar badge are correct on the
 * first render — before any Realtime INSERT event arrives.
 *
 * Renders nothing. Should be placed once per page that fetches pendingOrders.
 */
export function PendingCountSeeder({ count }: { count: number }) {
  const setPendingCount = useOrderStore((s) => s.setPendingCount);

  useEffect(() => {
    setPendingCount(count);
    // Only run on mount and when the server-provided count changes.
    // After this, Realtime incrementPending() drives the count.
  }, [count, setPendingCount]);

  return null;
}
