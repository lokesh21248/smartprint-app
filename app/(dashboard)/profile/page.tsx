import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getShopByUserId } from "@/lib/data/shop";
import { ProfileClient } from "@/components/dashboard/ProfileClient";
import type { ProfileShop } from "@/components/dashboard/ProfileClient";

export const metadata: Metadata = {
  title: "Profile",
  description: "View and manage your shop owner profile, contact details, and business information.",
};

export default async function ProfilePage() {
  const start = Date.now();
  const { userId } = await auth();
  if (!userId) redirect("/login");

  // Reuses the request-cached shop lookup from layout (0 additional DB queries)
  const shop = await getShopByUserId(userId);
  if (!shop) redirect("/create-shop");

  // Map Shop → ProfileShop, converting undefined to null to match the interface
  const profileShop: ProfileShop = {
    id: shop.id,
    name: shop.name ?? null,
    owner_name: shop.owner_name ?? null,
    owner_email: shop.owner_email ?? null,
    owner_phone: shop.owner_phone ?? null,
    address_line1: shop.address_line1 ?? null,
    city: shop.city ?? null,
    state: shop.state ?? null,
    pincode: shop.pincode ?? null,
    shop_code: shop.shop_code ?? null,
    slug: shop.slug ?? null,
    is_open: shop.is_open ?? null,
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] Profile page render: ${Date.now() - start} ms`);
  }

  return <ProfileClient shop={profileShop} appUrl={appUrl} />;
}
