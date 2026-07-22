import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Shop } from "@/types";
import { getUserShop } from "../auth/shop-access";

/**
 * Fetches shop data by Clerk User ID with React Cache.
 */
export const getShopByUserId = cache(async (userId: string): Promise<Shop | null> => {
  if (!userId) return null;
  
  try {
    const supabase = createAdminClient();

    // Fetch owner shop and staff assignment in parallel
    const [ownerShopResult, staffRecordResult] = await Promise.all([
      supabase
        .from("shops")
        .select("id, name, slug, shop_code, clerk_owner_id, owner_name, owner_email, owner_phone, address_line1, address_line2, city, state, pincode, is_open, price_bw_per_page, price_color_per_page, business_hours, updated_at")
        .eq("clerk_owner_id", userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("shop_staff")
        .select("shop_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);

    if (ownerShopResult.data) {
      return ownerShopResult.data as unknown as Shop;
    }

    if (staffRecordResult.data) {
      const { data: shop, error } = await supabase
        .from("shops")
        .select("id, name, slug, shop_code, clerk_owner_id, owner_name, owner_email, owner_phone, address_line1, address_line2, city, state, pincode, is_open, price_bw_per_page, price_color_per_page, business_hours, updated_at")
        .eq("id", staffRecordResult.data.shop_id)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[getShopByUserId] ❌ Database error fetching staff shop:", error);
        return null;
      }
      return shop as unknown as Shop;
    }

    return null;
  } catch (err) {
    console.error("[getShopByUserId] ❌ Unexpected error:", err);
    return null;
  }
});
