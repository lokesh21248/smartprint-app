import { createAdminClient } from "@/lib/supabase/admin";
import { Order } from "@/types";

// 🔴 C2 FIX: Removed standalone createClient() — was the 3rd Supabase client instance,
// wasting a connection slot on every warm serverless function.
// Now uses the shared admin singleton from lib/supabase/admin.ts.

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
   * Send notification to customer about order status.
   *
   * 🔴 C2 FIX: Changed from async → void (fire-and-forget).
   * The DB insert no longer blocks the caller's response.
   * Errors are caught and logged internally — they never surface to the user.
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
   * Alert shop owner about a new order.
   *
   * 🔴 C2 FIX: Changed from async → void (fire-and-forget).
   */
  static async alertNewOrder(
    shopOwnerId: string,
    orderDetails: Pick<Order, "total_amount" | "customer_name"> & { shop_id: string; order_id: string }
  ): Promise<void> {
    const supabase = createAdminClient();
    const amountInRupees = orderDetails.total_amount.toFixed(2);
    const message = `🖨️ New order from ${orderDetails.customer_name}! Amount: ₹${amountInRupees}`;

    console.log("[NOTIFICATION] preparing notification");
    console.log("[NOTIFICATION] user_id:\n" + shopOwnerId);
    console.log("[NOTIFICATION] shop_id:\n" + orderDetails.shop_id);
    console.log("[NOTIFICATION] inserting");

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        id: orderDetails.order_id, // deduplication key using existing order ID
        user_id: shopOwnerId,
        shop_id: orderDetails.shop_id,
        type: "new_order",
        title: "New Order Received",
        body: message,
        is_read: false,
      })
      .select()
      .single();

    if (error) {
       console.error('[NOTIFICATION INSERT FAILED]', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
       });
       throw error;
    }

    if (data) {
       console.log('[NOTIFICATION INSERT SUCCESS]', data.id);
    }
  }
}
