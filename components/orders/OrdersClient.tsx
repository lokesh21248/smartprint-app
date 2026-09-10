"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Virtuoso } from "react-virtuoso";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OrderCard } from "@/components/orders/OrderCard";
import { OrderFilters } from "@/components/orders/OrderFilters";
import { OrdersSkeleton } from "@/components/orders/OrdersSkeleton";
import { useOrderStore } from "@/stores/orderStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { markShopNotificationsAsRead } from "@/lib/actions/notifications";
import type { Order, OrderStatus } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TABS: { value: OrderStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PLACED", label: "New" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "PRINTING", label: "Printing" },
  { value: "READY", label: "Ready" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const TAB_BADGE_COLORS: Partial<Record<OrderStatus | "ALL", string>> = {
  PLACED: "bg-red-100 text-red-700",
  ACCEPTED: "bg-orange-100 text-orange-700",
  PRINTING: "bg-orange-100 text-orange-700",
  READY: "bg-green-100 text-green-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-gray-100 text-gray-600",
  ALL: "bg-blue-100 text-blue-700",
};

const TAB_ICONS: Partial<Record<OrderStatus | "ALL", string>> = {
  PLACED: "📬",
  ACCEPTED: "✅",
  PRINTING: "🖨️",
  READY: "📦",
  COMPLETED: "✔️",
  CANCELLED: "✖️",
  ALL: "📄",
};

// ─────────────────────────────────────────────────────────────────────────────
// Fetch function — no-store so it always hits fresh
// ─────────────────────────────────────────────────────────────────────────────
async function fetchOrders(shopId: string): Promise<{ orders: Order[]; total: number }> {
  if (!shopId) return { orders: [], total: 0 };
  const res = await fetch(
    `/api/shop/orders-list?shopId=${encodeURIComponent(shopId)}`,
    {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!res.ok) {
    console.error("[fetchOrders] API returned", res.status);
    return { orders: [], total: 0 };
  }
  const data = await res.json();
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    // API returns pagination.total = the real Supabase count for this shop.
    // Previously this was discarded, causing All = 30 (page size) instead of All = 43 (true total).
    total: data.pagination?.total ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
interface OrdersClientProps {
  initialOrders: Order[];
  shopId: string;
}

export function OrdersClient({ initialOrders, shopId }: OrdersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [mounted, setMounted] = useState(false);
  const storeOrders = useOrderStore((s) => s.orders);
  const isHydrated = useOrderStore((s) => s.isHydrated);
  const setOrders = useOrderStore((s) => s.setOrders);
  const updateOrder = useOrderStore((s) => s.updateOrder);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);

  // Guard: ensure the mark-as-read action fires exactly once per mount.
  // Without this, the dep array [mounted, shopId, initialOrders] could cause
  // re-execution if initialOrders reference changes, zeroing the badge twice.
  const hasMarkedReadRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Acknowledge all new-order notifications when the Orders page is opened.
  // This fires once on mount (guarded by hasMarkedReadRef) so that:
  //   1. The badge is cleared when the admin is actually viewing the orders.
  //   2. The DB is updated (is_read = true) exactly once per visit.
  //   3. If the admin navigates away and back, the badge is already 0 in the
  //      DB, so the layout's initial fetch won't re-inflate it.
  useEffect(() => {
    if (!mounted || !shopId || hasMarkedReadRef.current) return;
    hasMarkedReadRef.current = true;

    const state = useNotificationStore.getState();
    let hasUnread = false;
    state.notifications.forEach((n) => {
      if (n.type === "new_order" && !n.is_read) {
        hasUnread = true;
        state.markAsRead(n.id);
      }
    });

    if (hasUnread) {
      markShopNotificationsAsRead(shopId).catch((err: unknown) => {
        console.error("[OrdersClient] Failed to mark shop notifications as read:", err);
      });
    }
  }, [mounted, shopId]); 

  // GlobalOrderCacheSeeder (in the layout) already seeds the store with initialOrders
  // exactly once via setOrders(). A second setOrders() call here would create a race
  // on mount: if a Realtime event has already applied a status update (e.g. CANCELLED)
  // between the layout SSR render and this component mounting, re-seeding from the
  // frozen initialOrders prop would resurrect the stale status.
  // Solution: trust GlobalOrderCacheSeeder. OrdersClient only reads, never re-seeds.

  // ── URL-persisted filter state ────────────────────────────────────────────
  const activeTab = searchParams.get("status") ?? "ALL";
  const search = searchParams.get("q") ?? "";
  const sortBy = (searchParams.get("sort") ?? "newest") as "newest" | "amount";
  const dateFilter = searchParams.get("date") ?? "all";

  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // ── Background synchronization with React Query ─────────────────────────
  const { isFetching } = useQuery({
    queryKey: ["orders", shopId],
    queryFn: async () => {
      const result = await fetchOrders(shopId);
      if (result.orders.length > 0) {
        setOrders(result.orders);
      }
      return result.orders;
    },
    enabled: !!shopId,
    staleTime: 30000,
    gcTime: 300000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });

  // ── Per-status counts from the database ─────────────────────────────
  // KEY FIX: The SSR page (orders/page.tsx) now pre-fetches counts via
  // get_shop_stats RPC and injects them into the React Query cache via
  // HydrationBoundary. This means dbCounts is populated from FRAME 0,
  // eliminating the "All 30 → All 78" flash entirely.
  //
  // staleTime is 10s (down from 30s): Realtime events update the cache
  // in-memory instantly, so a periodic re-fetch just acts as a safety net.
  const { data: dbCounts } = useQuery({
    queryKey: ["order-counts", shopId],
    queryFn: async () => {
      if (!shopId) return null;
      if (process.env.NODE_ENV !== "production") {
        console.log("[PERF] Orders counts client fetch: START");
      }
      const t = Date.now();
      const res = await fetch(
        `/api/shop/order-counts?shopId=${encodeURIComponent(shopId)}`,
        { credentials: "include", cache: "no-store" }
      );
      if (process.env.NODE_ENV !== "production") {
        console.log(`[PERF] Orders counts client fetch: END ${Date.now() - t} ms`);
      }
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!shopId,
    staleTime: 10_000,   // 10s — Realtime handles instant updates; this is a safety net
    gcTime: 120_000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });

  // ── Source of truth: Zustand orderStore (live, Realtime-updated) ─────────
  //
  // initialOrders = SSR snapshot, frozen at page-render time. It is ONLY used
  // as a pre-hydration fallback so the page is not blank on first paint.
  //
  // Once isHydrated = true (set by setOrders in GlobalOrderCacheSeeder), storeOrders
  // is the authoritative dataset. Using initialOrders after hydration would re-insert
  // stale SSR statuses (e.g. PLACED) for orders whose status has already been updated
  // (e.g. to CANCELLED) via Realtime while the page was loading.
  const allOrders = useMemo(() => {
    if (isHydrated && storeOrders.length > 0) {
      // Hydrated: live store is the single source of truth
      return storeOrders;
    }
    // Pre-hydration: render the SSR snapshot so the page is not empty
    return initialOrders;
  }, [isHydrated, storeOrders, initialOrders]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const dateFilteredOrders = useMemo(() => {
    let orders = allOrders;

    // Date filter
    if (dateFilter !== "all") {
      const compareDate = new Date();
      if (dateFilter === "today") compareDate.setHours(0, 0, 0, 0);
      else if (dateFilter === "week") compareDate.setDate(compareDate.getDate() - 7);
      else if (dateFilter === "month") compareDate.setMonth(compareDate.getMonth() - 1);
      orders = orders.filter((o) => new Date(o.created_at) >= compareDate);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      orders = orders.filter(
        (o) =>
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_phone?.includes(q) ||
          o.short_token?.toLowerCase().includes(q)
      );
    }

    return orders;
  }, [allOrders, dateFilter, search]);

  // Step 2: Count per-status from the date-filtered set.
  // When no client-side filter (date/search) is active, use the accurate DB counts
  // from the order-counts API to avoid counts being capped at the 20-order page size.
  // When a filter IS active, fall back to the local filtered array length.
  //
  // NOTE: The `mounted` guard has been REMOVED. With SSR HydrationBoundary injecting
  // the real DB counts before first render, dbCounts is available from frame 0.
  // There is no hydration mismatch risk because server and client both use the same
  // SSR-injected value on first paint.
  const tabCounts = useMemo(() => {
    const useDb = !search && dateFilter === "all" && !!dbCounts;
    return TABS.reduce(
      (acc, tab) => {
        if (useDb) {
          // Map frontend tab values to the DB count keys
          const dbMap: Record<string, number> = {
            ALL:       dbCounts.total,
            PLACED:    dbCounts.placed,
            ACCEPTED:  dbCounts.accepted,
            PRINTING:  dbCounts.printing,
            READY:     dbCounts.ready,
            COMPLETED: dbCounts.completed,
            CANCELLED: dbCounts.cancelled,
          };
          acc[tab.value] = dbMap[tab.value] ?? 0;
        } else {
          acc[tab.value] =
            tab.value === "ALL"
              ? dateFilteredOrders.length
              : dateFilteredOrders.filter((o) => o.order_status === tab.value).length;
        }
        return acc;
      },
      {} as Record<string, number>
    );
  }, [dateFilteredOrders, dbCounts, search, dateFilter]);
  // Step 3: Apply tab (status) filter and sort on top of the date-filtered set
  const filteredOrders = useMemo(() => {
    const orders =
      activeTab === "ALL"
        ? dateFilteredOrders
        : dateFilteredOrders.filter((o) => o.order_status === activeTab);

    return [...orders].sort((a, b) => {
      if (sortBy === "amount") return b.total_amount - a.total_amount;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [dateFilteredOrders, activeTab, sortBy]);

  // Optimistic status update — updates centralized store & query cache immediately
  const handleStatusChange = useCallback(
    (orderId: string, newStatus: OrderStatus) => {
      updateOrder(orderId, { order_status: newStatus });
      queryClient.setQueryData<Order[]>(["orders", shopId], (prev) =>
        (prev ?? []).map((o) =>
          o.id === orderId ? { ...o, order_status: newStatus } : o
        )
      );

      // If accepting or cancelling, mark the related new_order notification as read
      if (newStatus === "ACCEPTED" || newStatus === "CANCELLED") {
        import("@/lib/actions/notifications").then(({ markOrderNotificationAsRead }) => {
          markOrderNotificationAsRead(orderId, shopId).then((res) => {
            if (res.success && res.updatedIds && res.updatedIds.length > 0) {
              const state = useNotificationStore.getState();
              res.updatedIds.forEach((id) => state.markAsRead(id));
            }
          });
        });
      }
    },
    [updateOrder, queryClient, shopId]
  );

  return (
    <div className="space-y-5">
      {/* ── Filters bar ─────────────────────────────────────────────────── */}
      <OrderFilters
        search={search}
        onSearchChange={(v) => updateUrl({ q: v || null })}
        sortBy={sortBy}
        onSortChange={(v) => updateUrl({ sort: v })}
        dateFilter={dateFilter}
        onDateFilterChange={(v) => updateUrl({ date: v })}
      />

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => updateUrl({ status: v === "ALL" ? null : v })}
      >
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="h-auto flex-nowrap w-max gap-1">
            {TABS.map((tab) => {
              const count = tabCounts[tab.value] ?? 0;
              const badgeColor =
                TAB_BADGE_COLORS[tab.value] ?? "bg-gray-100 text-gray-600";
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  id={`tab-${tab.value}`}
                  className="min-w-[80px]"
                >
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span
                      className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${badgeColor}`}
                    >
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {TABS.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            className="mt-4 focus-visible:outline-none"
          >
            {allOrders.length === 0 ? (
              <OrdersSkeleton />
            ) : filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-300">
                <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center mb-6 shadow-sm border border-gray-100">
                  <span className="text-4xl">
                    {TAB_ICONS[tab.value] ?? "📄"}
                  </span>
                </div>
                <h3 className="font-bold text-[#111827] text-xl">
                  No orders found
                </h3>
                <p className="text-[#6B7280] text-sm mt-2 max-w-xs mx-auto">
                  {search
                    ? `No orders matching "${search}" in this view.`
                    : dateFilter !== "all"
                    ? "Try selecting a wider date range."
                    : "When new orders arrive, they will appear here instantly."}
                </p>
              </div>
            ) : (
              <Virtuoso
                style={{ height: "calc(100vh - 290px)", minHeight: "400px" }}
                data={filteredOrders}
                computeItemKey={(_index, order) => order.id}
                itemContent={(_index, order) => (
                  <div className="pb-4">
                    <OrderCard
                      order={order}
                      onStatusChange={handleStatusChange}
                    />
                  </div>
                )}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* ── Background sync pill ─────────────────────────────────────────── */}
      {isFetching && allOrders.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 bg-white/95 backdrop-blur-sm shadow-lg rounded-full px-4 py-2 border border-gray-200 flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-200">
          <div className="w-2 h-2 rounded-full bg-[#2E8B57] animate-pulse" />
          <span className="text-xs font-medium text-gray-600">
            Syncing…
          </span>
        </div>
      )}
    </div>
  );
}
