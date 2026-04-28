import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shared/Sidebar";
import { Header } from "@/components/shared/Header";
import { ShopStoreInitializer } from "@/components/shared/ShopStoreInitializer";
import { DEMO_SHOP } from "@/lib/demo-data";
import type { Shop } from "@/types";

const IS_DEMO =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project");

async function getShopData(userId: string): Promise<Shop | null> {
  if (IS_DEMO) return DEMO_SHOP;
  try {
    const supabase = await createClient();
    const { data: shop } = await supabase
      .from("shops")
      .select("*")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    return shop ?? null;
  } catch {
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
            <div className="max-w-7xl mx-auto animate-fade-in">{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}
