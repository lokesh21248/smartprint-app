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
import { GlobalNotificationProvider } from "@/components/shared/GlobalNotificationProvider";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ConnectionStatusBanner } from "@/components/shared/ConnectionStatusBanner";
import { getShopByUserId } from "@/lib/data/shop";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order } from "@/types";
import type { AppNotification } from "@/stores/notificationStore";

async function getInitialState(userId: string, shopId: string) {
  const supabase = createAdminClient();

  const [ordersRes, notifsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, short_token, shop_id, customer_name, customer_phone, file_name, page_count, copies, is_color, is_double_sided, notes, total_amount, status, created_at, updated_at"
      )
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("notifications")
      .select("*")
      .eq("shop_id", shopId)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const mappedOrders: Order[] = (ordersRes.data ?? []).map((ord) => ({
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
    order_status: ord.status as Order["order_status"],
    notes: (ord.notes as string) ?? "",
    total_amount: (ord.total_amount as number) ?? 0,
    status_history: [],
    files: [],
    created_at: ord.created_at as string,
    updated_at: (ord.updated_at as string) ?? (ord.created_at as string),
  }));

  const mappedNotifs: AppNotification[] = (notifsRes.data ?? []).map((raw) => ({
    id: raw.id as string,
    shop_id: raw.shop_id as string,
    type: raw.type as string,
    title: raw.title as string,
    body: raw.body as string,
    data: (raw.data as Record<string, any>) || {},
    is_read: Boolean(raw.is_read),
    created_at: raw.created_at as string,
  }));

  return { orders: mappedOrders, notifications: mappedNotifs };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const start = Date.now();
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  // Single request-cached shop lookup
  const shop = await getShopByUserId(userId);

  if (!shop) {
    redirect("/create-shop");
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] Layout render: ${Date.now() - start} ms`);
  }

  const { orders, notifications } = await getInitialState(userId, shop.id);
  const pendingCount = orders.filter((o) => o.order_status?.toUpperCase() === "PLACED").length;

  return (
    <>
      <GlobalNotificationProvider shopId={shop.id} initialNotifications={notifications} />
      <ShopStoreInitializer shop={shop} />
      <AudioInitializer shopId={shop?.id ?? null} />
      {/*
        GlobalOrderCacheSeeder — Seeds the React Query ["orders"] and ["new-orders"]
        caches so realtime setQueryData calls from useRealtimeOrders always find
        a recipient even before page observers mount.
      */}
      <GlobalOrderCacheSeeder
        shopId={shop.id}
        initialOrders={orders}
        initialNewOrders={orders.filter((o) => o.order_status?.toUpperCase() === "PLACED")}
        pendingCount={pendingCount}
      />
      {/*
        OrderNavigationHandler — Translates custom "navigate-to-order" DOM events
        into Next.js router.push() calls to avoid full-page reloads.
      */}
      <OrderNavigationHandler />
      {/*
        GlobalNewOrderNotification — Shows a rich notification card on top of
        any admin page when a new order arrives via Supabase Realtime.
      */}
      <GlobalNewOrderNotification />
      {/*
        Layout shell:
        - Sidebar fixed at left.
        - Dynamic margin offset based on sidebar width.
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
