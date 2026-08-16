"use client";

/**
 * GlobalOrderCacheSeeder
 *
 * WHY THIS EXISTS
 * ───────────────
 * `useRealtimeOrders` (mounted in ShopStoreInitializer, inside the dashboard
 * layout) receives Supabase Realtime INSERT events and calls:
 *
 *   queryClient.setQueryData(["orders", shopId], (prev) => ...)
 *   queryClient.setQueryData(["new-orders", shopId], (prev) => ...)
 *
 * In React Query v5, `setQueryData` with a FUNCTIONAL updater silently does
 * nothing when:
 *   a) no cache entry exists for that key, AND
 *   b) no active observer (component using that query) is mounted.
 *
 * The OrdersClient (orders page) and NewOrdersFeed (dashboard) each create
 * observers for their respective query keys — BUT only while those pages are
 * mounted. When the shop owner is on Profile, Settings, Analytics, etc.,
 * NEITHER observer is active, so every realtime INSERT would be silently dropped.
 *
 * FIX
 * ───
 * Pre-populate both query keys with the server-fetched order data at layout
 * mount time. Once a cache entry exists (even an empty array), setQueryData
 * with a functional updater will correctly insert/update the entry and all
 * downstream observers will update when they next mount.
 *
 * IMPORTANT: We always seed with a DIRECT VALUE (not a functional updater)
 * so React Query creates the cache entry even with no active observer.
 *
 * This component is mounted ONCE in the authenticated dashboard layout,
 * alongside ShopStoreInitializer. It renders nothing.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrderStore } from "@/stores/orderStore";
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
  const setPendingCount = useOrderStore((s) => s.setPendingCount);

  useEffect(() => {
    if (!shopId) return;

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[ORDER_SYNC] GlobalOrderCacheSeeder: seeding cache for shop="${shopId}"`,
        `orders=${initialOrders.length}`,
        `newOrders=${initialNewOrders.length}`,
        `pending=${pendingCount}`
      );
    }

    // ── Seed full orders cache ─────────────────────────────────────────────
    // Always seed with a direct value (not a functional updater) so React Query
    // creates the cache entry even when no observer is mounted.
    //
    // We ONLY skip if the cache already has a non-empty entry — this means a
    // previous page visit (e.g. OrdersClient mount) has already fetched fresh
    // data. We never want to overwrite newer realtime-updated data with stale
    // SSR data.
    const existingOrders = queryClient.getQueryData<Order[]>(["orders", shopId]);
    if (!existingOrders || existingOrders.length === 0) {
      // Direct value assignment — creates the cache entry unconditionally.
      // This is the key fix: a missing cache entry causes setQueryData with
      // a functional updater to silently no-op in React Query v5.
      queryClient.setQueryData<Order[]>(["orders", shopId], initialOrders);
      if (process.env.NODE_ENV !== "production") {
        console.log(`[ORDER_SYNC] Seeded ["orders", "${shopId}"] with ${initialOrders.length} orders`);
      }
    } else {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[ORDER_SYNC] Cache already has ${existingOrders.length} orders — skipping seed to preserve realtime updates`);
      }
    }

    // ── Seed new-orders (PLACED) feed cache ───────────────────────────────
    const existingNew = queryClient.getQueryData<Order[]>(["new-orders", shopId]);
    if (!existingNew || existingNew.length === 0) {
      queryClient.setQueryData<Order[]>(["new-orders", shopId], initialNewOrders);
      if (process.env.NODE_ENV !== "production") {
        console.log(`[ORDER_SYNC] Seeded ["new-orders", "${shopId}"] with ${initialNewOrders.length} orders`);
      }
    }

    // ── Always seed bell badge count ──────────────────────────────────────
    // The layout-fetched count is the most authoritative on initial load.
    // Realtime incrementPending() / decrementPending() drive the count after this.
    // We always set it (even if other seeders have run) because the layout fetch
    // happens latest (server-side, most recent DB read).
    setPendingCount(pendingCount);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);
  // Intentionally only runs on shopId change (i.e. on mount and on shop change).
  // We do NOT re-seed on every render — that would race with live realtime updates.

  return null;
}
