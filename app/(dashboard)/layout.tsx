import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { Sidebar } from "@/components/shared/Sidebar";
import { Header } from "@/components/shared/Header";
import { ShopStoreInitializer } from "@/components/shared/ShopStoreInitializer";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";


import { getShopByUserId } from "@/lib/data/shop";

// getShopData removed in favor of cached lib/data/shop.ts

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const shop = userId ? await getShopByUserId(userId) : null;

  // Logged-in but no shop yet → send to the shop-creation flow.
  if (userId && !shop) {
    redirect("/create-shop");
  }

  return (
    <>
      <ShopStoreInitializer shop={shop} />
      <div className="flex h-screen overflow-hidden bg-[#FAFAFA]">
        <Sidebar />
        <div
          className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
          style={{ marginLeft: "var(--sidebar-w, 256px)" }}
        >
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
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
