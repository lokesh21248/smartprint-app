import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { OrdersClient } from "@/components/orders/OrdersClient";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order } from "@/types";
import { getShopByUserId } from "@/lib/data/shop";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

async function getInitialOrders(userId: string): Promise<{ orders: Order[]; shopId: string }> {
  try {
    const supabase = createAdminClient();
    const shop = await getShopByUserId(userId);

    if (!shop) return { orders: [], shopId: "" };

    const { data } = await supabase
      .from("orders")
      .select(`
        id,
        short_token,
        customer_name,
        customer_phone,
        file_name,
        page_count,
        copies,
        is_color,
        is_double_sided,
        notes,
        total_amount,
        status,
        created_at
      `)
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false })
      .limit(100);

    const mappedOrders: Order[] = (data ?? []).map((ord) => ({
      id: ord.id as string,
      short_token: ord.short_token as string,
      shop_id: shop.id,
      customer_name: ord.customer_name as string,
      customer_phone: ord.customer_phone as string,
      customer_phone_verified: false,
      file_name: ord.file_name as string,
      file_s3_key: "",
      page_count: ord.page_count as number,
      copies: ord.copies as number,
      color: (ord.is_color as boolean) || false,
      double_sided: (ord.is_double_sided as boolean) || false,
      order_status: ord.status as Order["order_status"],
      notes: ord.notes as string,
      total_amount: ord.total_amount as number,
      status_history: (ord.status_history as Order["status_history"]) || [],
      files: (ord.files as Order["files"]) || [],
      created_at: ord.created_at as string,
      updated_at: ord.updated_at as string,
    }));

    return { orders: mappedOrders, shopId: shop.id };
  } catch {
    return { orders: [], shopId: "" };
  }
}

export default async function OrdersPage() {
  const { userId } = await auth();
  const { orders, shopId } = userId 
    ? await getInitialOrders(userId) 
    : { orders: [], shopId: "" };
    
  return <OrdersClient initialOrders={orders} shopId={shopId} />;
}
