import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/shared/Sidebar";
import { Header } from "@/components/shared/Header";
import { ShopStoreInitializer } from "@/components/shared/ShopStoreInitializer";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { DEMO_SHOP } from "@/lib/demo-data";
import type { Shop } from "@/types";

const IS_DEMO =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project");

async function getShopData(userId: string): Promise<Shop | null> {
  if (IS_DEMO) return DEMO_SHOP;
  try {
    const supabase = createAdminClient();
    const { data: existingShop } = await supabase
      .from("shops")
      .select("*")
      .eq("clerk_owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (existingShop) {
      return {
        ...existingShop,
        pricing: existingShop.pricing || { bw: 200, color: 1000 },
        timings: existingShop.timings || {},
      } as unknown as Shop;
    }
    return null;
  } catch (err) {
    console.error("[getShopData] ❌ Error:", err);
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!IS_DEMO && !userId) {
    redirect("/login");
  }

  const shop = userId ? await getShopData(userId) : null;

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
