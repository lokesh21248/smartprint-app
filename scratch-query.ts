import { NotificationService } from "./lib/notifications";
import { randomUUID } from "crypto";
import { config } from "dotenv";

config({ path: ".env.local" });

async function test() {
  const shopOwnerId = "test_owner_" + Date.now();
  const shopId = randomUUID();
  const orderId = randomUUID();

  console.log("Testing NotificationService.alertNewOrder");
  try {
    await NotificationService.alertNewOrder(shopOwnerId, {
      shop_id: shopId,
      order_id: orderId,
      customer_name: "Test User",
      total_amount: 150.5,
    });
    console.log("TEST SUCCESS! Notification inserted.");
  } catch (err) {
    console.error("TEST FAILED", err);
  }
}

test();
