"use client";

import { useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Virtuoso } from "react-virtuoso";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OrderCard } from "@/components/orders/OrderCard";
import { OrderFilters } from "@/components/orders/OrderFilters";
import { OrdersSkeleton } from "@/components/orders/OrdersSkeleton";
import { useRealtimeOrders } from "@/lib/hooks/useRealtimeOrders";
import type { Order, OrderStatus } from "@/types";

const TABS: { value: OrderStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PLACED", label: "New" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "PRINTING", label: "Printing" },
  { value: "READY", label: "Ready" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

/**
 * Fetches orders via server API route.
 */
async function fetchOrders(shopId: string): Promise<Order[]> {
  if (!shopId) return [];
  const res = await fetch(`/api/shop/orders-list?shopId=${encodeURIComponent(shopId)}`, {
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.orders) ? data.orders : [];
}

interface OrdersClientProps {
  initialOrders: Order[];
  shopId: string;
}

export function OrdersClient({ initialOrders, shopId }: OrdersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // URL State Management
  const activeTab = searchParams.get("status") || "ALL";
  const search = searchParams.get("q") || "";
  const sortBy = (searchParams.get("sort") as "newest" | "amount") || "newest";
  const dateFilter = searchParams.get("date") || "all";

  const updateUrl = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) params.delete(key);
      else params.set(key, value);
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const { data: allOrders = initialOrders, isLoading, isFetching } = useQuery({
    queryKey: ["orders", shopId],
    queryFn: () => fetchOrders(shopId),
    initialData: initialOrders,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  useRealtimeOrders(shopId);

  const tabCounts = useMemo(() => {
    return TABS.reduce((acc, tab) => {
      acc[tab.value] = tab.value === "ALL" 
        ? allOrders.length 
        : allOrders.filter((o) => o.order_status === tab.value).length;
      return acc;
    }, {} as Record<string, number>);
  }, [allOrders]);

  const filteredOrders = useMemo(() => {
    let orders = activeTab === "ALL" 
      ? allOrders 
      : allOrders.filter((o) => o.order_status === activeTab);

    if (search.trim()) {
      const q = search.toLowerCase();
      orders = orders.filter(
        (o) =>
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_phone?.includes(q) ||
          o.short_token?.toLowerCase().includes(q)
      );
    }

    if (dateFilter !== "all") {
      const now = new Date();
      const compareDate = new Date();
      if (dateFilter === "today") compareDate.setHours(0, 0, 0, 0);
      else if (dateFilter === "week") compareDate.setDate(now.getDate() - 7);
      else if (dateFilter === "month") compareDate.setMonth(now.getMonth() - 1);
      
      orders = orders.filter((o) => new Date(o.created_at) >= compareDate);
    }

    return [...orders].sort((a, b) => {
      if (sortBy === "amount") return b.total_amount - a.total_amount;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [allOrders, activeTab, search, sortBy, dateFilter]);

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

  // Show skeleton only on initial load when no data exists
  if (isLoading && allOrders.length === 0) {
    return (
      <div className="space-y-6">
        <div className="h-11 w-full bg-gray-100 animate-pulse rounded-xl" />
        <OrdersSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <OrderFilters
        search={search}
        onSearchChange={(v) => updateUrl({ q: v || null })}
        sortBy={sortBy}
        onSortChange={(v) => updateUrl({ sort: v })}
        dateFilter={dateFilter}
        onDateFilterChange={(v) => updateUrl({ date: v })}
      />

      <Tabs value={activeTab} onValueChange={(v) => updateUrl({ status: v })}>
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="h-auto flex-nowrap w-max gap-1 bg-transparent p-0">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                id={`tab-${tab.value}`}
                className="min-w-[80px] rounded-xl data-[state=active]:bg-[#2E8B57] data-[state=active]:text-white transition-all"
              >
                <span>{tab.label}</span>
                {tabCounts[tab.value] > 0 && (
                  <span className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    activeTab === tab.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                  }`}>
                    {tabCounts[tab.value]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-6 focus-visible:outline-none">
            {filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-300">
                <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center mb-6 shadow-sm border border-gray-100">
                  <span className="text-4xl">
                    {tab.value === "PLACED" ? "📬" : tab.value === "COMPLETED" ? "✅" : "📄"}
                  </span>
                </div>
                <h3 className="font-bold text-[#111827] text-xl">No orders found</h3>
                <p className="text-[#6B7280] text-sm mt-2 max-w-xs mx-auto">
                  {search 
                    ? `No orders matching "${search}" in this view.` 
                    : "When new orders arrive, they will appear here instantly."}
                </p>
              </div>
            ) : (
              <Virtuoso
                style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}
                totalCount={filteredOrders.length}
                itemContent={(index) => (
                  <div className="pb-4 pr-1">
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

      {/* Background fetching indicator */}
      {isFetching && !isLoading && (
        <div className="fixed bottom-6 right-6 bg-white/90 backdrop-blur shadow-lg rounded-full px-4 py-2 border border-gray-100 flex items-center gap-2 animate-in slide-in-from-bottom-4">
          <div className="w-2 h-2 rounded-full bg-[#2E8B57] animate-pulse" />
          <span className="text-xs font-medium text-gray-600">Syncing live data...</span>
        </div>
      )}
    </div>
  );
}
