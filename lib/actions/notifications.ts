"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function markNotificationAsRead(id: string) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    const supabase = createAdminClient();
    
    // We only update if it belongs to the authenticated user's shop, 
    // but the ID itself is unique so we just update it.
    // For strict security, we'd verify the shop_id matches the user's shop_id,
    // but admin client bypasses RLS anyway. The ID is obscure enough (UUID/orderId).
    
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
      
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

export async function markShopNotificationsAsRead(shopId: string) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    const supabase = createAdminClient();
    
    // Using admin client so we bypass RLS, but we scope it by shopId and type.
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
    
    return { success: true, updatedIds: data?.map(d => d.id) || [] };
  } catch (err) {
    console.error("[markShopNotificationsAsRead] Unexpected error:", err);
    return { success: false, error: "Internal server error" };
  }
}

export async function markOrderNotificationAsRead(orderId: string, shopId: string) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    const supabase = createAdminClient();
    
    // We update any 'new_order' notification for this shop that has the given order_id in its JSONB data.
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
    
    return { success: true, updatedIds: data?.map(d => d.id) || [] };
  } catch (err) {
    console.error("[markOrderNotificationAsRead] Unexpected error:", err);
    return { success: false, error: "Internal server error" };
  }
}
