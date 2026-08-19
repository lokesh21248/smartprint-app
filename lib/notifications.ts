import { createAdminClient } from "@/lib/supabase/admin";
import { Order } from "@/types";

// Uses the shared admin singleton — no extra Supabase connection slots wasted.

export type NotificationType = "ORDER_PLACED" | "ORDER_ACCEPTED" | "ORDER_READY" | "ORDER_CANCELLED";

interface NotificationParams {
  orderId: string;
  phone: string;
  customerName: string;
  status: string;
  shortToken?: string;
}

export class NotificationService {
  /**
   * Send notification to customer about order status (SMS/push — future integration).
   * Fire-and-forget: errors are logged, never thrown.
   */
  static sendStatusUpdate(params: NotificationParams): void {
    const supabase = createAdminClient();
    const { customerName, status, shortToken } = params;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://scan2paper.com";
    const message = `Hi ${customerName}, your order #${shortToken} status is now: ${status}. Track here: ${appUrl}/order/${shortToken}`;

    console.log(`[Notification] Status update → ${status} for token ${shortToken}`);

    // TODO: Integrate with MSG91 or Twilio
    // fetch('https://api.msg91.com/...', { ... }).catch(() => {})

    // Fire-and-forget DB log — never awaited
    void Promise.resolve(
      supabase
        .from("notifications")
        .insert({
          user_id: "system",
          type: "status_change",
          title: `Order ${status}`,
          body: message,
        })
    ).then(null, (err) => console.error("[Notification] sendStatusUpdate insert failed:", err));
  }

  /**
   * Alert shop owner about a new order by inserting a new_order notification.
   *
   * ─── SINGLE SOURCE OF TRUTH ───────────────────────────────────────────────
   * This is the ONLY place in the codebase that creates a `new_order`
   * notification. It is called as a background task from POST /api/orders
   * immediately after a successful order INSERT.
   *
   * ─── DEDUPLICATION ────────────────────────────────────────────────────────
   * Notification ID = Order ID. The notifications table PK ensures only ONE
   * notification can ever exist per order. If this function is accidentally
   * called twice (e.g., idempotency retry), the second INSERT fails with
   * code 23505 (unique_violation) which we treat as a safe no-op.
   *
   * ─── REALTIME ─────────────────────────────────────────────────────────────
   * The INSERT triggers Supabase Realtime → GlobalNotificationProvider →
   * notificationStore → unreadCount → bell badge + orders badge + toast + sound.
   * This requires notifications to be in the supabase_realtime publication
   * (migration: 20260819000001_fix_notifications_realtime.sql).
   */
  static async alertNewOrder(
    shopOwnerId: string,
    orderDetails: Pick<Order, "total_amount" | "customer_name"> & { shop_id: string; order_id: string }
  ): Promise<void> {
    const supabase = createAdminClient();
    const amountInRupees = orderDetails.total_amount.toFixed(2);
    const body = `🖨️ New order from ${orderDetails.customer_name}! Amount: ₹${amountInRupees}`;

    console.log("[NEW ORDER] order created:", orderDetails.order_id);
    console.log("[NEW ORDER] shop_id:", orderDetails.shop_id);
    console.log("[NEW ORDER] shop owner user_id:", shopOwnerId);
    console.log("[NOTIFICATION] creating new_order notification");

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        id: orderDetails.order_id,   // PK = order_id → natural deduplication
        user_id: shopOwnerId,
        shop_id: orderDetails.shop_id,
        type: "new_order",
        title: "New Order Received",
        body,
        is_read: false,
        // `data` JSONB is read by the frontend notification card for
        // "View Order" button navigation and toast display details.
        data: {
          order_id: orderDetails.order_id,
          shop_id: orderDetails.shop_id,
          customer_name: orderDetails.customer_name,
          total_amount: orderDetails.total_amount,
        },
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = unique_violation: notification for this order already exists.
      // Safe — the order is real, this is just an idempotent duplicate call.
      if (error.code === "23505") {
        console.log("[NOTIFICATION] insert result: already exists (idempotent no-op) for order:", orderDetails.order_id);
        return;
      }
      console.error("[NOTIFICATION] insert result: error", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }

    console.log("[NOTIFICATION] insert result: success", data?.id);
  }
}
