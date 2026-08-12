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

    // Run owner and staff lookups in parallel — whichever hits returns first.
    // Owner path: single query on shops (indexed on clerk_owner_id).
    // Staff path: join shop_staff → shops in ONE round-trip using Supabase
    //   relational select, eliminating the previous 3-query waterfall
    //   (check shops → miss, check shop_staff → hit, fetch shop by id).
    const [ownerShopResult, staffShopResult] = await Promise.all([
      supabase
        .from("shops")
        .select("id, name, slug, shop_code, clerk_owner_id, owner_name, owner_email, owner_phone, address_line1, address_line2, city, state, pincode, is_open, price_bw_per_page, price_color_per_page, business_hours, updated_at")
        .eq("clerk_owner_id", userId)
        .limit(1)
        .maybeSingle(),
      // Join shop_staff → shops in a single relational query.
      // If the user is a staff member this returns all shop fields in one round-trip.
      // Supabase PostgREST resolves the foreign key shops(id) → shop_staff(shop_id).
      supabase
        .from("shop_staff")
        .select("shop_id, shops:shop_id(id, name, slug, shop_code, clerk_owner_id, owner_name, owner_email, owner_phone, address_line1, address_line2, city, state, pincode, is_open, price_bw_per_page, price_color_per_page, business_hours, updated_at)")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);

    // Owner found — return immediately
    if (ownerShopResult.data) {
      return ownerShopResult.data as unknown as Shop;
    }

    // Staff found — extract the joined shop record
    if (staffShopResult.data?.shops) {
      return staffShopResult.data.shops as unknown as Shop;
    }

    return null;
  } catch (err) {
    console.error("[getShopByUserId] ❌ Unexpected error:", err);
    return null;
  }
});
