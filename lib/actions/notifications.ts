"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserShop } from "@/lib/auth/shop-access";

/**
 * markNotificationAsRead — marks a single notification as read.
 *
 * IDOR PROTECTION:
 * Previously this function updated by `id` only (admin client bypasses RLS).
 * A malicious shop owner who guessed another shop's notification UUID could
 * mark it as read. Now we scope the UPDATE to both `id` AND the authenticated
 * user's `shop_id`, so Shop A can never affect Shop B's notifications.
 */
export async function markNotificationAsRead(id: string) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    // Derive shopId from the authenticated user — never trust a caller-provided value
    const shopId = await getUserShop(userId);
    if (!shopId) return { success: false, error: "No shop found for this user" };

    const supabase = createAdminClient();

    // IDOR-safe: scoped by both id AND the authenticated user's shop_id
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) {
      console.error("[markNotificationAsRead] DB error:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("[markNotificationAsRead] Unexpected error:", err);
    return { success: false, error: "Internal server error" };
  }
}

/**
 * markShopNotificationsAsRead — bulk mark all unread new_order notifications
 * for the authenticated user's shop as read.
 *
 * shopId is derived server-side — never trusted from the caller.
 */
export async function markShopNotificationsAsRead(shopId: string) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    // Verify the caller actually owns/manages this shop
    const authenticatedShopId = await getUserShop(userId);
    if (!authenticatedShopId || authenticatedShopId !== shopId) {
      return { success: false, error: "Forbidden: not authorized for this shop" };
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("shop_id", shopId)
      .eq("type", "new_order")
      .eq("is_read", false)
      .select("id");

    if (error) {
      console.error("[markShopNotificationsAsRead] DB error:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, updatedIds: data?.map((d) => d.id) || [] };
  } catch (err) {
    console.error("[markShopNotificationsAsRead] Unexpected error:", err);
    return { success: false, error: "Internal server error" };
  }
}

/**
 * markOrderNotificationAsRead — marks the new_order notification for a specific
 * order as read. The notification must belong to the authenticated user's shop.
 */
export async function markOrderNotificationAsRead(orderId: string, shopId: string) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    // Verify the caller actually owns/manages this shop
    const authenticatedShopId = await getUserShop(userId);
    if (!authenticatedShopId || authenticatedShopId !== shopId) {
      return { success: false, error: "Forbidden: not authorized for this shop" };
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("shop_id", shopId)
      .eq("type", "new_order")
      .eq("is_read", false)
      .filter("data->>order_id", "eq", orderId)
      .select("id");

    if (error) {
      console.error("[markOrderNotificationAsRead] DB error:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, updatedIds: data?.map((d) => d.id) || [] };
  } catch (err) {
    console.error("[markOrderNotificationAsRead] Unexpected error:", err);
    return { success: false, error: "Internal server error" };
  }
}
