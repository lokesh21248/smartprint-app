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

// ─── Process-level Auth Cache ─────────────────────────────────────────────────
//
// ADDITIONAL CACHE: a short-lived (30s TTL), bounded (500 entries) module-level
// Map that persists across requests on the same warm serverless instance.
//
// WHY IS THIS SAFE?
//   - Shop ownership never changes within 30 seconds in practice.
//   - Admin bypass (clerkRole === "admin") is handled before cache lookup.
//   - Cache miss falls through to DB — no stale-forever risk.
//   - Max 500 entries prevents unbounded memory growth on high-traffic instances.
//   - Each entry = one userId:shopId boolean — negligible memory per entry.
//
// BENEFIT: eliminates 2 Supabase round-trips (~300–500ms) per API call for
// warm instances. Cold starts still pay the DB cost exactly once.
//
const PROCESS_CACHE_TTL_MS = 30_000; // 30 seconds
const PROCESS_CACHE_MAX = 500;

interface ProcessCacheEntry {
  result: boolean;
  expiresAt: number;
}

const processAuthCache = new Map<string, ProcessCacheEntry>();

function getProcessCache(key: string): boolean | undefined {
  const entry = processAuthCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    processAuthCache.delete(key);
    return undefined;
  }
  return entry.result;
}

function setProcessCache(key: string, result: boolean): void {
  // Evict oldest entries when at capacity (simple FIFO eviction)
  if (processAuthCache.size >= PROCESS_CACHE_MAX) {
    const firstKey = processAuthCache.keys().next().value;
    if (firstKey !== undefined) processAuthCache.delete(firstKey);
  }
  processAuthCache.set(key, { result, expiresAt: Date.now() + PROCESS_CACHE_TTL_MS });
}

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
 * Checks ownership and staff assignments in parallel.
 *
 * @param userId Clerk User ID
 */
export async function getUserShop(userId: string): Promise<string | null> {
  if (!userId) return null;
  const supabase = createAdminClient();

  const [ownerShopResult, staffRecordResult] = await Promise.all([
    supabase
      .from("shops")
      .select("id")
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
    return ownerShopResult.data.id;
  }

  if (staffRecordResult.data) {
    return staffRecordResult.data.shop_id;
  }

  return null;
}

/**
 * Validates if a user has access to manage a shop.
 * Allowed roles: admin (any shop), shop owner, manager (assigned shop), staff (assigned shop).
 *
 * PERFORMANCE — three cache layers:
 *   1. Admin fast-path: role from Clerk session claims → zero DB cost
 *   2. Process-level cache (30s TTL): eliminates DB queries on warm instances
 *   3. Request-scoped AsyncLocalStorage: dedupes within a single request
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

  // Fast path 1: admin bypass via session claims (zero DB cost)
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

  const cacheKey = `${userId}:${shopId}`;

  // Fast path 2: request-scoped cache (zero DB cost on repeat calls within same request)
  const store = shopAccessStore.getStore();
  if (store?.has(cacheKey)) {
    return store.get(cacheKey)!;
  }

  // Fast path 3: process-level TTL cache (zero DB cost on warm instances within 30s)
  const processHit = getProcessCache(cacheKey);
  if (processHit !== undefined) {
    store?.set(cacheKey, processHit); // also populate request cache
    return processHit;
  }

  // DB lookup — 2 parallel queries, ~150–400ms combined
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

  // Populate both cache layers for future requests
  setProcessCache(cacheKey, result);
  store?.set(cacheKey, result);
  return result;
}
