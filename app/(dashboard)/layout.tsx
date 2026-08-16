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

  return (
    <>
      <ShopStoreInitializer shop={shop} />
      <AudioInitializer shopId={shop?.id ?? null} />
      {/*
        GlobalOrderCacheSeeder — Seeds the React Query ["orders"] and ["new-orders"]
        caches so realtime setQueryData calls from useRealtimeOrders always find
        a recipient even before page observers mount.
      */}
      <GlobalOrderCacheSeeder
        shopId={shop?.id ?? null}
        initialOrders={[]}
        initialNewOrders={[]}
        pendingCount={0}
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
