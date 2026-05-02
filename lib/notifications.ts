import { createClient } from "@supabase/supabase-js";
import { Order } from "@/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
   * Send notification to customer about order status
   */
  static async sendStatusUpdate(params: NotificationParams) {
    const { phone, customerName, status, shortToken } = params;
    
    const message = `Hi ${customerName}, your order #${shortToken} status is now: ${status}. Track here: https://smartprint.in/order/${shortToken}`;
    
    console.log(`[Notification] Sending to ${phone}: ${message}`);
    
    // TODO: Integrate with MSG91 or Twilio
    // await fetch('https://api.msg91.com/...', { ... })

    // Log to DB
    await supabase.from("notifications").insert({
      user_id: "system", // Or shop owner ID
      type: "status_change",
      title: `Order ${status}`,
      message: message,
    });
    
    return { success: true };
  }

  /**
   * Alert shop owner about a new order
   */
  static async alertNewOrder(shopOwnerId: string, orderDetails: Pick<Order, "total_amount" | "customer_name">) {
    const amountInRupees = (orderDetails.total_amount / 100).toFixed(2);
    const message = `🖨️ New order from ${orderDetails.customer_name}! Amount: ₹${amountInRupees}`;
    
    console.log(`[Notification] Alerting owner ${shopOwnerId}: ${message}`);

    // Log to DB (will trigger real-time dashboard alert)
    await supabase.from("notifications").insert({
      user_id: shopOwnerId,
      type: "new_order",
      title: "New Order Received",
      message: message,
    });

    return { success: true };
  }
}
