import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { ShopProfileForm } from "@/components/dashboard/ShopProfileForm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_SHOP } from "@/lib/demo-data";
import type { Shop } from "@/types";

export const metadata: Metadata = { title: "My Shop" };

const IS_DEMO =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project");

async function getShop(userId: string): Promise<Shop> {
  if (IS_DEMO) return DEMO_SHOP;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("shops")
      .select("*")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    return (data as Shop) ?? DEMO_SHOP;
  } catch {
    return DEMO_SHOP;
  }
}

export default async function ShopProfilePage() {
  const { userId } = await auth();
  const shop = userId ? await getShop(userId) : DEMO_SHOP;
  return <ShopProfileForm shop={shop} />;
}
