import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getShopByUserId } from "@/lib/data/shop";
import { SettingsClient } from "@/components/dashboard/SettingsClient";

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure notifications, sound alerts, auto-accept settings, and printer preferences for your Scan2Paper shop.",
};

export default async function SettingsPage() {
  const start = Date.now();
  const { userId } = await auth();
  if (!userId) redirect("/login");

  // Reuses the request-cached shop lookup from layout (0 additional DB queries)
  const shop = await getShopByUserId(userId);

  const shopId = shop?.id || null;
  const shopName = shop?.name || "My Shop";
  const shopEmail = shop?.owner_email || "";
  const shopLocation =
    [shop?.city, shop?.state].filter(Boolean).join(", ") ||
    shop?.address_line1 ||
    "Location not set";

  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] Settings page render: ${Date.now() - start} ms`);
  }

  return (
    <SettingsClient
      shopId={shopId}
      shopName={shopName}
      shopEmail={shopEmail}
      shopLocation={shopLocation}
    />
  );
}
