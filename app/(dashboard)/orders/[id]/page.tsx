import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { auth } from "@clerk/nextjs/server";
import type { Order } from "@/types";
import { OrderDetailView } from "@/components/orders/OrderDetailView";
export const metadata: Metadata = { title: "Order Details" };

async function getOrder(id: string, userId: string): Promise<Order | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("orders")
      .select("id, short_token, shop_id, customer_name, customer_phone, customer_phone_verified, file_s3_key, file_name, page_count, copies, is_color, is_double_sided, notes, total_amount, status, status_history, files, created_at, updated_at, shops!inner(clerk_owner_id)")
      .eq("id", id)
      .limit(1)
      .maybeSingle();

    if (!data) return null;

    // Verify ownership — shop owner can only see their own orders
    const shopData = data.shops as unknown as { clerk_owner_id: string } | null;
    if (!shopData || shopData.clerk_owner_id !== userId) return null;

    // Map live DB column names → TypeScript Order type
    const mappedOrder: Order = {
      id: data.id,
      short_token: data.short_token,
      shop_id: data.shop_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      customer_phone_verified: data.customer_phone_verified || false,
      file_s3_key: data.file_s3_key,
      file_name: data.file_name,
      page_count: data.page_count,
      copies: data.copies,
      color: data.is_color,
      double_sided: data.is_double_sided,
      notes: data.notes,
      total_amount: data.total_amount,
      order_status: data.status as Order["order_status"],
      status_history: data.status_history || [],
      files: data.files || [],
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return mappedOrder;
  } catch {
    return null;
  }
}

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { userId } = await auth();
  if (!userId) notFound();
  const order = await getOrder(params.id, userId!);
  if (!order) notFound();
  return <OrderDetailView order={order} />;
}
