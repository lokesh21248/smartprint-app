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
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

import { getShopByUserId } from "@/lib/data/shop";
import { requireShopOwner } from "@/lib/auth/role-guard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireShopOwner() calls auth() internally — no need for a second auth() call
  await requireShopOwner();
  const { userId } = await auth();

  const shop = userId ? await getShopByUserId(userId) : null;

  // Logged-in but no shop yet → send to the shop-creation flow.
  if (userId && !shop) {
    redirect("/create-shop");
  }

  return (
    <>
      <ShopStoreInitializer shop={shop} />
      <AudioInitializer shopId={shop?.id ?? null} />
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
