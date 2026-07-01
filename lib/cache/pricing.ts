/**
 * Shop pricing cache helpers.
 *
 * Centralises cache invalidation logic so it can be called from
 * /api/shop/update without importing from a route file (which would
 * violate Next.js's route module export constraints).
 */

import { redisDel } from "@/lib/redis";

// Module-level Map shared with orders/route.ts via this module
// (each serverless instance has its own copy — Redis is the cross-instance layer)
export interface PricingEntry {
  price_bw_per_page: number;
  price_color_per_page: number;
  clerk_owner_id: string | null;
  expiresAt: number;
}

export const pricingCacheMap = new Map<string, PricingEntry>();

/**
 * Invalidates the shop pricing cache in both Redis and the per-instance Map.
 * Call this after a successful shop pricing update.
 */
export async function invalidateShopPricingCache(shopId: string): Promise<void> {
  pricingCacheMap.delete(shopId);
  await redisDel(`pricing:${shopId}`);
}
