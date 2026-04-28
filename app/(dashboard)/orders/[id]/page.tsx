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
    return data as Order | null;
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
