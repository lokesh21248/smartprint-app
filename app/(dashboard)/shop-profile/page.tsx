import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { ShopProfileForm } from "@/components/dashboard/ShopProfileForm";
import { getShopByUserId } from "@/lib/data/shop";

export const metadata: Metadata = { title: "My Shop Profile" };
export const revalidate = 60;

export default async function ShopProfilePage() {
  const { userId } = await auth();
  if (!userId) return <div>Unauthorized</div>;

  const shop = await getShopByUserId(userId);
  if (!shop) return <div>Shop not found. Please log in properly.</div>;

  return <ShopProfileForm shop={shop} />;
}
