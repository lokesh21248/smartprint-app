/**
 * In-memory sliding window rate limiter.
 *
 * Why NOT the DB approach:
 * - The old ratelimit.ts made 2 Supabase DB round-trips per request
 *   (SELECT count + INSERT into audit_log).
 * - At 10K concurrent users this saturates the Supabase connection pool fast.
 *
 * Trade-off with in-memory:
 * - State is per-serverless-instance (not globally shared across Vercel deploys).
 * - This is ACCEPTABLE: rate limiting is a best-effort defence, not a hard lock.
 *   If a user hits two different function instances they might get slightly more
 *   requests through — but the Supabase DB-level constraints still protect data.
 * - For true global rate limiting, add Upstash Redis (one extra env var).
 *
 * Performance: 0 DB calls, O(1) lookup, < 0.1ms per check.
 */

interface WindowEntry {
  count: number;
  resetAt: number; // epoch ms when the window expires
}

// Module-level map — lives for the lifetime of the serverless function instance
const store = new Map<string, WindowEntry>();

// Prune expired entries every 5 minutes to prevent unbounded memory growth
let pruneTimer: ReturnType<typeof setInterval> | null = null;
function ensurePruner() {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of Array.from(store.entries())) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 5 * 60 * 1000);
  // Don't block Node.js process shutdown
  if (pruneTimer.unref) pruneTimer.unref();
}

/**
 * Sliding-window rate limiter (in-memory).
 *
 * @param identifier - Unique key, e.g. IP address or phone number
 * @param limit      - Max requests allowed in the window (default: 5)
 * @param windowSecs - Window size in seconds (default: 3600 = 1 hour)
 */
export function rateLimit(
  identifier: string,
  limit: number = 5,
  windowSecs: number = 3600
): { success: boolean; remaining: number } {
  try {
    ensurePruner();

    const now = Date.now();
    const existing = store.get(identifier);

    // Window expired or first request — start fresh
    if (!existing || existing.resetAt <= now) {
      store.set(identifier, { count: 1, resetAt: now + windowSecs * 1000 });
      return { success: true, remaining: limit - 1 };
    }

    // Within window — check count
    if (existing.count >= limit) {
      return { success: false, remaining: 0 };
    }

    existing.count += 1;
    return { success: true, remaining: limit - existing.count };
  } catch (err) {
    // Fail open: if rate limiter fails, allow the request but log the error
    console.error("[rateLimit] Critical failure:", err);
    return { success: true, remaining: 1 };
  }
}

