import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { ShopProfileForm } from "@/components/dashboard/ShopProfileForm";
import { getShopByUserId } from "@/lib/data/shop";

export const metadata: Metadata = {
  title: "My Shop Profile",
  description: "View and edit your print shop details, address, contact information, and business settings.",
};
export const dynamic = "force-dynamic";

export default async function ShopProfilePage() {
  const start = Date.now();
  const { userId } = await auth();
  if (!userId) return <div>Unauthorized</div>;

  // Reuses the request-cached shop lookup from layout (0 additional DB queries)
  const shop = await getShopByUserId(userId);
  if (!shop) return <div>Shop not found. Please log in properly.</div>;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] Shop Profile page render: ${Date.now() - start} ms`);
  }

  return <ShopProfileForm shop={shop} />;
}
