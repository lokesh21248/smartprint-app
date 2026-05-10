import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Shop } from "@/types";

/**
 * Fetches shop data by Clerk User ID with React Cache.
 */
export const getShopByUserId = cache(async (userId: string): Promise<Shop | null> => {
  if (!userId) return null;
  
  try {
    const supabase = createAdminClient();
    const { data: shop, error } = await supabase
      .from("shops")
      .select("id, name, slug, shop_code, clerk_owner_id, owner_email, owner_phone, address_line1, is_open, price_bw_per_page, price_color_per_page, business_hours, updated_at")
      .eq("clerk_owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[getShopByUserId] ❌ Database error:", error);
      return null;
    }

    return shop as unknown as Shop;
  } catch (err) {
    console.error("[getShopByUserId] ❌ Unexpected error:", err);
    return null;
  }
});
