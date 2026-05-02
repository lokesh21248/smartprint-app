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
        order_number,
        customer_name,
        customer_phone,
        file_s3_key,
        file_name,
        page_count,
        copies,
        is_color,
        is_double_sided,
        notes,
        total_amount,
        status,
        status_history,
        created_at,
        updated_at
      `)
      .eq("shop_id", shop.id)
      .in("status", ["PLACED", "ACCEPTED", "PRINTING"])
      .order("created_at", { ascending: false })
      .limit(50);

    const mappedOrders = (data ?? []).map((ord) => ({
      id: ord.id as string,
      short_token: ord.short_token as string,
      order_number: ord.order_number as string,
      customer_name: ord.customer_name as string,
      customer_phone: ord.customer_phone as string,
      file_s3_key: ord.file_s3_key as string,
      file_name: ord.file_name as string,
      page_count: ord.page_count as number,
      copies: ord.copies as number,
      color: ord.is_color as boolean,
      double_sided: ord.is_double_sided as boolean,
      notes: ord.notes as string,
      total_amount: ord.total_amount as number,
      order_status: ord.status as Order["order_status"],
      status_history: (ord.status_history as Order["status_history"]) || [],
      created_at: ord.created_at as string,
      updated_at: ord.updated_at as string,
    }));

    return { orders: mappedOrders as unknown as Order[], shopId: shop.id };
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
