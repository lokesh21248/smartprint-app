"use client";

import { useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Virtuoso } from "react-virtuoso";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OrderCard } from "@/components/orders/OrderCard";
import { OrderFilters } from "@/components/orders/OrderFilters";
import { OrdersSkeleton } from "@/components/orders/OrdersSkeleton";
import { useRealtimeOrders } from "@/lib/hooks/useRealtimeOrders";
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
async function fetchOrders(shopId: string): Promise<Order[]> {
  if (!shopId) return [];
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
    return [];
  }
  const data = await res.json();
  return Array.isArray(data.orders) ? data.orders : [];
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

  // ── URL-persisted filter state ────────────────────────────────────────────
  // Defaults: status=ALL  date=all  sort=newest
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

  // ── React Query ───────────────────────────────────────────────────────────
  // initialData hydrates the cache from the SSR payload — no blank flash.
  // staleTime: 0  → always revalidate in background on mount.
  // placeholderData keeps the previous data visible during background refetch.
  const {
    data: allOrders = initialOrders,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["orders", shopId],
    queryFn: () => fetchOrders(shopId),
    enabled: !!shopId,
    initialData: initialOrders,
    // Mark initialData as instantly stale so React Query always fires a
    // background refetch on mount — without this the SSR data never updates.
    initialDataUpdatedAt: 0,
    staleTime: 60000,
    gcTime: 300000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    // keepPreviousData keeps the SSR orders visible during the background
    // refetch — this is what prevents orders from going blank on refresh.
    placeholderData: keepPreviousData,
  });

  // ── Realtime subscription (INSERT / UPDATE / DELETE) ─────────────────────
  useRealtimeOrders(shopId);

  // ── Derived state ─────────────────────────────────────────────────────────
  // Step 1: Apply date + search filters FIRST to get the base dataset.
  // Tab counts are derived from this so they always reflect the active date range.
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

  // Step 2: Count per-status from the date-filtered set — NOT from allOrders.
  const tabCounts = useMemo(() => {
    return TABS.reduce(
      (acc, tab) => {
        acc[tab.value] =
          tab.value === "ALL"
            ? dateFilteredOrders.length
            : dateFilteredOrders.filter((o) => o.order_status === tab.value).length;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [dateFilteredOrders]);

  // Step 3: Apply tab (status) filter and sort on top of the date-filtered set.
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

  // Optimistic status update — patch cache immediately without API roundtrip
  const handleStatusChange = useCallback(
    (orderId: string, newStatus: OrderStatus) => {
      queryClient.setQueryData<Order[]>(["orders", shopId], (prev) =>
        (prev ?? []).map((o) =>
          o.id === orderId ? { ...o, order_status: newStatus } : o
        )
      );
    },
    [queryClient, shopId]
  );

  // ── Initial hard-loading state ────────────────────────────────────────────
  // Only show skeleton when there is ZERO data — never when we have
  // initialOrders already hydrated from the server.
  if (isLoading && allOrders.length === 0) {
    return (
      <div className="space-y-6">
        <div className="h-11 w-full rounded-xl bg-gray-100 animate-pulse" />
        <OrdersSkeleton />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
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
            {/* Show skeleton ONLY while background-fetching AND no data yet */}
            {isFetching && allOrders.length === 0 ? (
              <OrdersSkeleton />
            ) : filteredOrders.length === 0 ? (
              /* Empty state — only after data is confirmed empty */
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
                totalCount={filteredOrders.length}
                itemContent={(index) => (
                  <div className="pb-4">
                    <OrderCard
                      order={filteredOrders[index]}
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
