import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { OrderDetailView } from "@/components/orders/OrderDetailView";
import { DEMO_ORDERS } from "@/lib/demo-data";
import { notFound } from "next/navigation";
import type { Order } from "@/types";

export const metadata: Metadata = { title: "Order Details" };

const IS_DEMO =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project");

async function getOrder(id: string): Promise<Order | null> {
  if (IS_DEMO) {
    return DEMO_ORDERS.find((o) => o.id === id) ?? DEMO_ORDERS[0];
  }
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .limit(1)
      .maybeSingle();

    if (!data) return null;

    // Map DB fields back to flat structure
    const mappedOrder: Order = {
      id: data.id,
      short_token: data.short_token,
      order_number: data.order_number,
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
      status: data.status,
      status_history: data.status_history || [],
      created_at: data.created_at,
      updated_at: data.updated_at,
    } as unknown as Order;

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
  const order = await getOrder(params.id);
  if (!order) notFound();
  return <OrderDetailView order={order} />;
}
