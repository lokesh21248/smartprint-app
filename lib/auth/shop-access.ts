import { createAdminClient } from "@/lib/supabase/admin";
import { auth } from "@clerk/nextjs/server";
import { AsyncLocalStorage } from "async_hooks";

// ─── Request-scoped Auth Cache ────────────────────────────────────────────────
//
// Problem: canManageShop() fires 2 parallel DB queries on every authenticated
// API call. Dashboard page renders 4+ routes simultaneously → 8+ redundant
// auth queries per page load.
//
// Solution: AsyncLocalStorage gives each request its own isolated Map.
// Within a single request, the first canManageShop(userId, shopId) call hits
// the DB; every subsequent call for the same pair is instant (Map lookup).
//
// Why NOT a module-level Map?
//   Serverless functions share module state across requests on warm instances.
//   A module-level cache leaks auth decisions between users — a security bug.
//   AsyncLocalStorage is strictly per-request-execution-context.
//
// Lifecycle: the store is created fresh per request and GC'd when the request
// handler returns. No TTL needed, no manual invalidation.
//
const shopAccessStore = new AsyncLocalStorage<Map<string, boolean>>();

/**
 * Wrap an API handler (or a parallel Promise.all block) to enable the
 * request-scoped auth cache for all canManageShop() calls within it.
 *
 * Usage (in route handlers):
 *   return withShopAccessCache(() => handleRequest(req));
 *
 * Or at the top of any async function that makes multiple canManageShop calls:
 *   await withShopAccessCache(async () => { ... });
 */
export function withShopAccessCache<T>(fn: () => Promise<T>): Promise<T> {
  return shopAccessStore.run(new Map<string, boolean>(), fn);
}

/**
 * Resolves the shop ID associated with a user.
 * Checks ownership first, then falls back to staff assignments.
 *
 * @param userId Clerk User ID
 */
export async function getUserShop(userId: string): Promise<string | null> {
  if (!userId) return null;
  const supabase = createAdminClient();

  // 1. Check if the user is the owner of a shop
  const { data: ownerShop } = await supabase
    .from("shops")
    .select("id")
    .eq("clerk_owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (ownerShop) {
    return ownerShop.id;
  }

  // 2. Check if the user is a staff/manager in shop_staff
  const { data: staffRecord } = await supabase
    .from("shop_staff")
    .select("shop_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (staffRecord) {
    return staffRecord.shop_id;
  }

  return null;
}

/**
 * Validates if a user has access to manage a shop.
 * Allowed roles: admin (any shop), shop owner, manager (assigned shop), staff (assigned shop).
 *
 * PERFORMANCE: Results are cached per-request via AsyncLocalStorage.
 * The first call for a (userId, shopId) pair hits the DB (2 parallel queries).
 * All subsequent calls within the same request are O(1) Map lookups.
 *
 * @param userId    Clerk User ID
 * @param shopId    Target Shop ID
 * @param clerkRole Pre-resolved role from session claims (avoids a redundant auth() call)
 */
export async function canManageShop(
  userId: string,
  shopId: string,
  clerkRole?: string
): Promise<boolean> {
  if (!userId || !shopId) return false;

  // Fast path: admin bypass via session claims (zero DB cost)
  let resolvedClerkRole = clerkRole;
  if (resolvedClerkRole === undefined) {
    const authObj = await auth();
    resolvedClerkRole = String(
      (authObj.sessionClaims?.metadata as Record<string, unknown> | undefined)?.role ?? ""
    )
      .trim()
      .toLowerCase();
  }

  if (resolvedClerkRole === "admin") return true;

  // Request-scoped cache check (zero DB cost on repeat calls within same request)
  const store = shopAccessStore.getStore();
  const cacheKey = `${userId}:${shopId}`;
  if (store?.has(cacheKey)) {
    return store.get(cacheKey)!;
  }

  // DB lookup — 2 parallel queries, ~15–30ms combined
  const supabase = createAdminClient();
  const [shopResult, staffResult] = await Promise.all([
    supabase
      .from("shops")
      .select("clerk_owner_id")
      .eq("id", shopId)
      .maybeSingle(),
    supabase
      .from("shop_staff")
      .select("role")
      .eq("shop_id", shopId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const shop = shopResult.data;
  const staffRecord = staffResult.data;

  const result =
    (shop?.clerk_owner_id === userId) ||
    (staffRecord != null &&
      ["owner", "shop_owner", "manager", "staff"].includes(
        String(staffRecord.role).trim().toLowerCase()
      ));

  // Cache the result for the remainder of this request
  store?.set(cacheKey, result);
  return result;
}
