import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

import { Sidebar } from "@/components/shared/Sidebar";
import { Header } from "@/components/shared/Header";
import { ShopStoreInitializer } from "@/components/shared/ShopStoreInitializer";
import { AudioInitializer } from "@/components/shared/AudioInitializer";
import { GlobalOrderCacheSeeder } from "@/components/shared/GlobalOrderCacheSeeder";
import { OrderNavigationHandler } from "@/components/shared/OrderNavigationHandler";
import { GlobalNewOrderNotification } from "@/components/shared/GlobalNewOrderNotification";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ConnectionStatusBanner } from "@/components/shared/ConnectionStatusBanner";

import { getShopByUserId } from "@/lib/data/shop";
import { requireShopOwner } from "@/lib/auth/role-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order } from "@/types";

/**
 * Lightweight server-side fetch of recent orders and PLACED orders.
 *
 * WHY: Seeds the React Query cache at layout level so the realtime hook's
 * setQueryData() calls always find a cache entry, regardless of which page
 * the shop owner is currently viewing. Without this seeding, setQueryData
 * calls are silently dropped by React Query v5 when no page-level observer
 * is mounted for the ["orders", shopId] or ["new-orders", shopId] keys.
 */
async function fetchLayoutSeedData(shopId: string): Promise<{
  orders: Order[];
  newOrders: Order[];
  pendingCount: number;
}> {
  try {
    const supabase = createAdminClient();

    const mapRow = (ord: Record<string, unknown>): Order => {
      const rawStatus = String(ord.status || "").trim().toUpperCase();
      const order_status = (rawStatus === "NEW" ? "PLACED" : rawStatus) as Order["order_status"];

      return {
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
        order_status,
        notes: (ord.notes as string) ?? "",
        total_amount: (ord.total_amount as number) ?? 0,
        status_history: [],
        files: [],
        created_at: ord.created_at as string,
        updated_at: (ord.updated_at as string) ?? (ord.created_at as string),
      };
    };

    const COLS =
      "id, short_token, shop_id, customer_name, customer_phone, file_name, page_count, copies, is_color, is_double_sided, notes, total_amount, status, created_at, updated_at";

    // Optimized: 1 query instead of 2. Recent orders are fetched once, and
    // placed/new orders are derived in memory with zero extra DB round-trips.
    const { data, error } = await supabase
      .from("orders")
      .select(COLS)
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(70);

    if (error) {
      console.error("[DashboardLayout] fetchLayoutSeedData DB error:", error.message);
      return { orders: [], newOrders: [], pendingCount: 0 };
    }

    const orders = (data ?? []).map(mapRow);
    const newOrders = orders
      .filter((o) => o.order_status === "PLACED")
      .slice(0, 10);
    const pendingCount = newOrders.length;

    return { orders, newOrders, pendingCount };
  } catch (err) {
    console.error("[DashboardLayout] fetchLayoutSeedData error:", err);
    return { orders: [], newOrders: [], pendingCount: 0 };
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Single auth() call — Next.js deduplicates auth() within a request via
  // React cache, so the requireShopOwner() call above is effectively free.
  await requireShopOwner();
  const { userId } = await auth();

  const shop = userId ? await getShopByUserId(userId) : null;

  // Logged-in but no shop yet → send to the shop-creation flow.
  if (userId && !shop) {
    redirect("/create-shop");
  }

  // Fetch seed data only when we have a valid shop — this pre-populates the
  // React Query cache globally so the realtime hook's setQueryData() calls
  // always have a recipient, regardless of which page is currently active.
  const { orders, newOrders, pendingCount } = shop
    ? await fetchLayoutSeedData(shop.id)
    : { orders: [], newOrders: [], pendingCount: 0 };

  return (
    <>
      <ShopStoreInitializer shop={shop} />
      <AudioInitializer shopId={shop?.id ?? null} />
      {/*
        GlobalOrderCacheSeeder — FIXES the "order only appears after opening
        Orders page" bug. Seeds the React Query ["orders"] and ["new-orders"]
        caches at layout level so realtime setQueryData calls from
        useRealtimeOrders always find a cache entry to update, even when
        OrdersClient and NewOrdersFeed are not mounted.
      */}
      <GlobalOrderCacheSeeder
        shopId={shop?.id ?? null}
        initialOrders={orders}
        initialNewOrders={newOrders}
        pendingCount={pendingCount}
      />
      {/*
        OrderNavigationHandler — FIXES "View Order" toast action causing a
        full page reload. Translates the custom "navigate-to-order" DOM event
        (dispatched by the realtime hook) into a Next.js router.push() call.
      */}
      <OrderNavigationHandler />
      {/*
        GlobalNewOrderNotification — FIXES the "no notification on non-Orders
        pages" UX gap. Subscribes to orderStore.newOrders (populated by the
        global realtime hook in ShopStoreInitializer) and shows a rich
        fixed-position overlay card on any admin page when a new order arrives.
        Deduplicates by order ID, auto-dismisses after 12s.
      */}
      <GlobalNewOrderNotification />
      {/*
        Layout strategy:
        - Sidebar is `fixed` at left edge, full height.
        - On desktop (md+): content area has left padding equal to sidebar width.
        - On mobile (<md): sidebar is hidden; content fills full width.
        - The Sidebar component manages its own collapsed state and sets
          `--sidebar-w` on document.documentElement so the padding stays in sync.
      */}
      <div className="flex h-screen overflow-hidden bg-[#FAFAFA]">
        <Sidebar />
        <div
          id="dashboard-main"
          className="flex-1 flex flex-col overflow-hidden transition-all duration-300 ml-0 md:ml-[var(--sidebar-w,256px)]"
        >
          <ConnectionStatusBanner />
          <Header />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto animate-fade-in">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
