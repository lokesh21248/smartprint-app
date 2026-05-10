import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminShopDetailClient } from "@/components/admin/AdminShopDetailClient";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Shop Details | Admin" };

export default async function AdminShopDetailPage({ params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  // Fetch shop details
  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, slug, clerk_owner_id, owner_email, owner_phone, address_line1, city, state, pincode, is_approved, is_open")
    .eq("id", params.id)
    .single();

  if (!shop) notFound();

  // 2. Fetch Aggregated Shop Stats
  const [ordersCountRes, revenueRes, latestOrdersRes] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", params.id),
    supabase.from("orders").select("total_amount").eq("shop_id", params.id).eq("status", "COMPLETED"),
    supabase.from("orders").select("id, short_token, total_amount, status, created_at").eq("shop_id", params.id).order("created_at", { ascending: false }).limit(10)
  ]);

  const totalOrders = ordersCountRes.count || 0;
  const completedOrders = (revenueRes.data || []);
  const totalRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const completedCount = completedOrders.length;

  return (
    <AdminShopDetailClient 
      shop={shop} 
      stats={{
        totalOrders,
        totalRevenue,
        completedCount
      }}
      latestOrders={(latestOrdersRes.data || []) as Record<string, unknown>[]} 
    />
  );
}
