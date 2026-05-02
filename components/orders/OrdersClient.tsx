"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Virtuoso } from "react-virtuoso";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OrderCard } from "@/components/orders/OrderCard";
import { OrderFilters } from "@/components/orders/OrderFilters";
import { OrderCardSkeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeOrders } from "@/lib/hooks/useRealtimeOrders";
import { DEMO_ORDERS } from "@/lib/demo-data";
import type { Order, OrderStatus } from "@/types";

const IS_DEMO =
  typeof window !== "undefined" &&
  (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project"));

const TABS: { value: OrderStatus | "ALL"; label: string }[] = [
  { value: "PLACED", label: "New" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "PRINTING", label: "Printing" },
  { value: "READY", label: "Ready" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];



async function fetchOrders(shopId: string): Promise<Order[]> {
  if (IS_DEMO) return DEMO_ORDERS;
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(`
      id,
      short_token,
      customer_name,
      customer_phone,
      page_count,
      copies,
      color,
      double_sided,
      notes,
      total_amount,
      order_status,
      created_at,
      updated_at
    `)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as Order[];
}

interface OrdersClientProps {
  initialOrders: Order[];
  shopId: string;
}

export function OrdersClient({ initialOrders, shopId }: OrdersClientProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("PLACED");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"time" | "amount">("time");
  const [dateFilter, setDateFilter] = useState<string>("today");

  const { data: allOrders = initialOrders, isLoading } = useQuery({
    queryKey: ["orders", shopId],
    queryFn: () => fetchOrders(shopId),
    initialData: initialOrders,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  useRealtimeOrders(IS_DEMO ? null : shopId);

  const tabCounts = useMemo(() => {
    return TABS.reduce(
      (acc, tab) => {
        acc[tab.value] = allOrders.filter((o) => o.order_status === tab.value).length;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [allOrders]);

  const filteredOrders = useMemo(() => {
    let orders = allOrders.filter((o) => o.order_status === activeTab);

    if (search.trim()) {
      const q = search.toLowerCase();
      orders = orders.filter(
        (o) =>
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_phone?.includes(q)
      );
    }

    if (dateFilter === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      orders = orders.filter(
        (o) => new Date(o.created_at) >= today
      );
    }

    orders = [...orders].sort((a, b) => {
      if (sortBy === "amount") return b.total_amount - a.total_amount;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return orders;
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

  return (
    <div className="space-y-5">
      {/* Filters */}
      <OrderFilters
        search={search}
        onSearchChange={setSearch}
        sortBy={sortBy}
        onSortChange={setSortBy}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
          <TabsList className="h-auto flex-nowrap w-max gap-1">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                id={`tab-${tab.value}`}
                className="min-w-[80px]"
              >
                <span>{tab.label}</span>
                {tabCounts[tab.value] > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${
                    tab.value === "PLACED"
                      ? "bg-red-100 text-red-700"
                      : tab.value === "PRINTING" || tab.value === "ACCEPTED"
                      ? "bg-orange-100 text-orange-700"
                      : tab.value === "READY"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                  >
                    {tabCounts[tab.value]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <OrderCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#F3F4F6] flex items-center justify-center mb-4">
                  <span className="text-3xl">
                    {tab.value === "PLACED" ? "📬" : tab.value === "COMPLETED" ? "✅" : "🖨️"}
                  </span>
                </div>
                <p className="font-semibold text-[#374151] text-lg">
                  No {tab.label.toLowerCase()} orders
                </p>
                 <p className="text-[#9CA3AF] text-sm mt-1">
                   {tab.value === "PLACED"
                     ? "All new orders have been handled."
                     : `No orders in ${tab.label.toLowerCase()} status right now.`}
                 </p>
              </div>
            ) : (
              <Virtuoso
                style={{ height: "calc(100vh - 280px)", minHeight: "400px" }}
                totalCount={filteredOrders.length}
                itemContent={(index) => (
                  <div className="pb-3">
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
    </div>
  );
}
