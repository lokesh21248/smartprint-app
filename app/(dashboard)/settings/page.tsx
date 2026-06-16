import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsClient } from "@/components/dashboard/SettingsClient";

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure notifications, sound alerts, auto-accept settings, and printer preferences for your Scan2Paper shop.",
};

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const { getUserShop } = await import("@/lib/auth/shop-access");
  const shopIdFromUser = await getUserShop(userId);

  const supabase = createAdminClient();
  let shop = null;
  if (shopIdFromUser) {
    const { data } = await supabase
      .from("shops")
      .select("id, name, owner_email, city, state, address_line1")
      .eq("id", shopIdFromUser)
      .limit(1)
      .maybeSingle();
    shop = data;
  }

  const shopId = shop?.id || null;
  const shopName = shop?.name || "My Shop";
  const shopEmail = shop?.owner_email || "";
  const shopLocation =
    [shop?.city, shop?.state].filter(Boolean).join(", ") ||
    shop?.address_line1 ||
    "Location not set";

  return (
    <SettingsClient
      shopId={shopId}
      shopName={shopName}
      shopEmail={shopEmail}
      shopLocation={shopLocation}
    />
  );
}
