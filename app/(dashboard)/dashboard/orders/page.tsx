import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShopByUserId } from "@/lib/data/shop";
import { OrdersClient } from "@/components/orders/OrdersClient";
import { OrdersSkeleton } from "@/components/orders/OrdersSkeleton";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import type { Order } from "@/types";

export const metadata: Metadata = {
  title: "Orders | Scan2Paper",
  description: "View and manage all incoming print orders — accept, print, and track order status in real time.",
};
export const dynamic = "force-dynamic";

// ─── Per-status counts shape (mirrors /api/shop/order-counts response) ────────
interface OrderCounts {
  total: number;
  placed: number;
  accepted: number;
  printing: number;
  ready: number;
  completed: number;
  cancelled: number;
}

// ─── SSR data loader ──────────────────────────────────────────────────────────
// Runs two Supabase queries in parallel:
//   1. First 20 orders (list)
//   2. get_shop_stats RPC (accurate per-status counts for tab badges)
//
// Both results are injected into a React Query QueryClient that is dehydrated
// into the page. The client picks them up via HydrationBoundary, so:
//   - Tab badges show the true DB total on FIRST PAINT (no flash)
//   - Order list is pre-populated immediately
//   - No client-side fetch waterfall on page open
async function getSSRData(userId: string): Promise<{
  orders: Order[];
  shopId: string;
  counts: OrderCounts | null;
}> {
  try {
    const supabase = createAdminClient();
    const shop = await getShopByUserId(userId);
    if (!shop) return { orders: [], shopId: "", counts: null };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Parallel: orders list + counts RPC ────────────────────────────────
    const countStart = Date.now();
    const [ordersRes, statsRes] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, short_token, shop_id, customer_name, customer_phone, file_name, page_count, copies, is_color, is_double_sided, notes, total_amount, status, created_at, updated_at"
        )
        .eq("shop_id", shop.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.rpc("get_shop_stats", {
        p_shop_id: shop.id,
        p_today: today.toISOString(),
      }),
    ]);

    if (process.env.NODE_ENV !== "production") {
      console.log(`[PERF] Orders SSR parallel fetch: ${Date.now() - countStart} ms`);
    }

    // ── Map orders ────────────────────────────────────────────────────────
    const mappedOrders: Order[] = ((ordersRes.data ?? []) as Record<string, unknown>[]).map((ord) => ({
      id: ord.id as string,
      short_token: ord.short_token as string,
      shop_id: ord.shop_id as string,
      customer_name: ord.customer_name as string,
      customer_phone: ord.customer_phone as string,
      customer_phone_verified: false,
      file_name: ord.file_name as string,
      file_s3_key: "",
      page_count: (ord.page_count as number) ?? 0,
      copies: (ord.copies as number) ?? 1,
      color: (ord.is_color as boolean) ?? false,
      double_sided: (ord.is_double_sided as boolean) ?? false,
      order_status: (() => {
        const s = String(ord.status ?? "").trim().toUpperCase();
        return (s === "NEW" ? "PLACED" : s) as Order["order_status"];
      })(),
      notes: (ord.notes as string) ?? "",
      total_amount: (ord.total_amount as number) ?? 0,
      status_history: [],
      files: [],
      created_at: ord.created_at as string,
      updated_at: (ord.updated_at as string) ?? (ord.created_at as string),
    }));

    // ── Map counts ────────────────────────────────────────────────────────
    let counts: OrderCounts | null = null;
    if (!statsRes.error && statsRes.data) {
      const row = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
      if (row) {
        counts = {
          total:     Number(row.total_orders     ?? 0),
          placed:    Number(row.placed_count     ?? 0),
          accepted:  Number(row.accepted_count   ?? 0),
          printing:  Number(row.printing_count   ?? 0),
          ready:     Number(row.ready_count      ?? 0),
          completed: Number(row.completed_count  ?? 0),
          cancelled: Number(row.cancelled_count  ?? 0),
        };
        if (process.env.NODE_ENV !== "production") {
          console.log(`[PERF] Orders counts SSR: total=${counts.total} placed=${counts.placed}`);
        }
      }
    } else if (statsRes.error) {
      console.error("[getSSRData] get_shop_stats RPC error:", statsRes.error.message);
    }

    return { orders: mappedOrders, shopId: shop.id, counts };
  } catch (err) {
    console.error("[getSSRData] Unexpected error:", err);
    return { orders: [], shopId: "", counts: null };
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function OrdersPage() {
  const start = Date.now();
  const { userId } = await auth();

  const { orders, shopId, counts } = userId
    ? await getSSRData(userId)
    : { orders: [], shopId: "", counts: null };

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[PERF] Orders page SSR total: ${Date.now() - start} ms (${orders.length} orders, counts=${counts?.total ?? "n/a"})`
    );
  }

  // ── Hydrate React Query client with SSR data ──────────────────────────────
  // This is the key fix: both queries are pre-populated BEFORE the client renders.
  // Result: tab badge counts show the correct DB total on first paint — no flash.
  const queryClient = new QueryClient();

  if (shopId) {
    // Seed order list cache (same key as OrdersClient useQuery)
    queryClient.setQueryData(["orders", shopId], orders);

    // Seed order counts cache (same key as OrdersClient useQuery)
    // This is what eliminates the "All 30 → All 78" flash.
    if (counts !== null) {
      queryClient.setQueryData(["order-counts", shopId], counts);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersClient initialOrders={orders} shopId={shopId} />
      </Suspense>
    </HydrationBoundary>
  );
}
