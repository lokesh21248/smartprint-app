import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProfileClient } from "@/components/dashboard/ProfileClient";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  // Fetch full shop data for the profile page — broader select than getShopByUserId
  const supabase = createAdminClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, owner_email, owner_phone, address_line1, city, state, pincode, shop_code, slug, is_open")
    .eq("clerk_owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (!shop) redirect("/create-shop");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return <ProfileClient shop={shop} appUrl={appUrl} />;
}
