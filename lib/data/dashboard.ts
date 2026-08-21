import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order } from "@/types";
import type { AppNotification } from "@/stores/notificationStore";

export interface DashboardInitialState {
  orders: Order[];
  notifications: AppNotification[];
  pendingOrders: Order[];
  pendingCount: number;
}

/**
 * getDashboardInitialState — shared, React.cache()-wrapped data loader.
 *
 * PERFORMANCE:
 * ─────────────
 * React.cache() deduplicates this function within a single RSC render tree.
 * Both the layout AND the dashboard page call this function. With cache(),
 * the second call costs zero — it returns the already-resolved Promise.
 *
 * Without this, the layout fetches 30 orders + 50 notifications, then the
 * dashboard page fetches another 200 orders + new orders separately →
 * 4 extra Supabase round-trips per page load (~1–2s of extra wait).
 *
 * DATA:
 * ─────
 * - Latest 30 orders: seeds orderStore + React Query cache for all dashboard pages
 * - Unread notifications (up to 50): seeds notificationStore for badge counts
 * - pendingOrders: subset with status PLACED/NEW — used by NewOrdersFeed + banner
 * - pendingCount: integer — used by PendingCountSeeder
 *
 * COLUMNS:
 * ────────
 * Only the columns actually consumed by the UI are fetched.
 * Heavy columns (files, status_history, metadata) are omitted from this
 * initial load and loaded lazily when the admin opens an individual order.
 */
export const getDashboardInitialState = cache(
  async (shopId: string): Promise<DashboardInitialState> => {
    const supabase = createAdminClient();

    const [ordersRes, notifsRes] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, short_token, shop_id, customer_name, customer_phone, file_name, page_count, copies, is_color, is_double_sided, notes, total_amount, status, created_at, updated_at"
        )
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("notifications")
        .select("id, shop_id, type, title, body, data, is_read, created_at")
        .eq("shop_id", shopId)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const orders: Order[] = (ordersRes.data ?? []).map((ord) => ({
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
      // Normalize status: DB may have lowercase 'new'/'placed' or uppercase 'PLACED'.
      // Frontend always expects uppercase.
      order_status: (() => {
        const s = String(ord.status ?? "").trim().toUpperCase();
        return (s === "NEW" ? "PLACED" : s) as Order["order_status"];
      })(),
      notes: (ord.notes as string) ?? "",
      total_amount: (ord.total_amount as number) ?? 0,
      status_history: [],
      files: [],
      created_at: ord.created_at as string,
      updated_at: (ord.updated_at as string) ?? (ord.created_at as string),
    }));

    const notifications: AppNotification[] = (notifsRes.data ?? []).map((raw) => ({
      id: raw.id as string,
      shop_id: raw.shop_id as string,
      type: raw.type as string,
      title: raw.title as string,
      body: raw.body as string,
      data: (raw.data as Record<string, any>) || {},
      is_read: Boolean(raw.is_read),
      created_at: raw.created_at as string,
    }));

    const pendingOrders = orders.filter(
      (o) => o.order_status?.toUpperCase() === "PLACED"
    );

    return {
      orders,
      notifications,
      pendingOrders,
      pendingCount: pendingOrders.length,
    };
  }
);

/**
 * Compute dashboard stats from the already-fetched orders.
 * Called by the dashboard page — zero extra DB queries.
 *
 * The stats computation runs entirely in JS over the 30-order sample.
 * For a more accurate all-time revenue figure, the /api/shop/stats endpoint
 * (which uses the get_shop_stats RPC) is fetched client-side by StatsSection.
 */
export function computeStatsFromOrders(orders: Order[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalRevenue = 0;
  let completedCount = 0;
  let totalCompletionMins = 0;

  for (const o of orders) {
    const s = o.order_status?.toUpperCase();
    if (s !== "COMPLETED" && s !== "SUCCESS") continue;
    // For the initial stat we use updated_at as a proxy for completed_at
    const compDate = new Date(o.updated_at ?? o.created_at);
    if (compDate < today) continue;
    totalRevenue += Number(o.total_amount) || 0;
    completedCount++;
    totalCompletionMins +=
      (compDate.getTime() - new Date(o.created_at).getTime()) / 60_000;
  }

  const ordersToday = orders.filter((o) => new Date(o.created_at) >= today);
  const uniqueCustomers = new Set(
    ordersToday.map((o) => o.customer_phone || "anonymous")
  ).size;

  const pendingOrders = orders.filter((o) => {
    const s = o.order_status?.toUpperCase();
    return s === "PLACED" || s === "NEW";
  });

  return {
    pendingOrders: pendingOrders.length,
    ordersToday: ordersToday.length,
    revenueToday: totalRevenue,
    avgCompletionMins:
      completedCount > 0
        ? Math.round(totalCompletionMins / completedCount)
        : 0,
    activeCustomers: uniqueCustomers,
    completedToday: completedCount,
  };
}
