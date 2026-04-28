import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { OrdersClient } from "@/components/orders/OrdersClient";
import { createClient } from "@/lib/supabase/server";
import { DEMO_ORDERS, DEMO_SHOP } from "@/lib/demo-data";
import type { Order } from "@/types";

export const metadata: Metadata = { title: "Orders" };

const IS_DEMO =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project");

async function getInitialOrders(userId: string): Promise<{ orders: Order[]; shopId: string }> {
  if (IS_DEMO) return { orders: DEMO_ORDERS, shopId: DEMO_SHOP.id };
  try {
    const supabase = await createClient();
    const { data: shop } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (!shop) return { orders: [], shopId: "" };

    const { data } = await supabase
      .from("orders")
      .select(`
        id,
        short_token,
        customer_name,
        customer_phone,
        page_count,
        copies,
        color,
        double_sided,
        notes,
        total_amount,
        order_status,
        created_at,
        updated_at
      `)
      .eq("shop_id", shop.id)
      .in("order_status", ["PLACED", "ACCEPTED", "PRINTING"])
      .order("created_at", { ascending: false })
      .limit(50);

    return { orders: (data ?? []) as Order[], shopId: shop.id };
  } catch {
    return { orders: DEMO_ORDERS, shopId: DEMO_SHOP.id };
  }
}

export default async function OrdersPage() {
  const { userId } = await auth();
  const { orders, shopId } = userId 
    ? await getInitialOrders(userId) 
    : { orders: [], shopId: "" };
    
  return <OrdersClient initialOrders={orders} shopId={shopId} />;
}
