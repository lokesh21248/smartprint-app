import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { OrdersClient } from "@/components/orders/OrdersClient";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order } from "@/types";
import { getShopByUserId } from "@/lib/data/shop";

export const metadata: Metadata = { title: "Orders | SmartPrint" };
export const dynamic = "force-dynamic";

async function getInitialOrders(
  userId: string
): Promise<{ orders: Order[]; shopId: string }> {
  try {
    const supabase = createAdminClient();
    const shop = await getShopByUserId(userId);
    if (!shop) return { orders: [], shopId: "" };

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, short_token, shop_id, customer_name, customer_phone, file_name, page_count, copies, is_color, is_double_sided, notes, total_amount, status, created_at, updated_at"
      )
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false })
      .limit(70);

    if (error) {
      console.error("[getInitialOrders] DB error:", error.message);
      return { orders: [], shopId: shop.id };
    }

    const mappedOrders: Order[] = (data ?? []).map((ord) => ({
      id: ord.id as string,
      short_token: ord.short_token as string,
      shop_id: ord.shop_id as string,
      customer_name: ord.customer_name as string,
      customer_phone: ord.customer_phone as string,
      customer_phone_verified: false,
      file_name: ord.file_name as string,
      file_s3_key: "",
      page_count: (ord.page_count as number) ?? 0,
      copies: (ord.copies as number) ?? 1,
      color: (ord.is_color as boolean) ?? false,
      double_sided: (ord.is_double_sided as boolean) ?? false,
      order_status: ord.status as Order["order_status"],
      notes: (ord.notes as string) ?? "",
      total_amount: (ord.total_amount as number) ?? 0,
      status_history: [],
      files: [],
      created_at: ord.created_at as string,
      updated_at: (ord.updated_at as string) ?? (ord.created_at as string),
    }));

    return { orders: mappedOrders, shopId: shop.id };
  } catch (err) {
    console.error("[getInitialOrders] Unexpected error:", err);
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
