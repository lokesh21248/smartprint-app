import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AdminOverviewClient } from "@/components/admin/AdminOverviewClient";

export const metadata: Metadata = { title: "Overview | Admin" };

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  // Fetch global stats
  const { data: shops } = await supabase.from("shops").select("id, is_active");
  const { data: orders } = await supabase.from("orders").select("total_amount, order_status, created_at");

  const totalShops = shops?.length || 0;
  const activeShops = shops?.filter(s => s.is_active).length || 0;
  const totalRevenue = orders?.filter(o => o.order_status === "COMPLETED").reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) || 0;
  const totalOrders = orders?.length || 0;

  const stats = {
    totalShops,
    activeShops,
    totalRevenue,
    totalOrders,
    pendingApproval: shops?.filter(s => !s.is_approved).length || 0
  };

  return <AdminOverviewClient stats={stats} orders={orders || []} />;
}
