import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AdminShopDetailClient } from "@/components/admin/AdminShopDetailClient";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Shop Details | Admin" };

export default async function AdminShopDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  // Fetch shop details
  const { data: shop } = await supabase
    .from("shops")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!shop) notFound();

  // Fetch shop stats
  const { data: orders } = await supabase
    .from("orders")
    .select("total_amount, order_status, created_at")
    .eq("shop_id", params.id);

  return <AdminShopDetailClient shop={shop} orders={orders || []} />;
}
