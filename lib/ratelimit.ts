/**
 * In-memory sliding-window rate limiter.
 *
 * Trade-off: state is per-serverless-instance (not globally shared across
 * Vercel regions). This is ACCEPTABLE — rate limiting is a best-effort
 * defence layer. Data-level constraints in Supabase are the hard guard.
 *
 * For true global rate limiting: add Upstash Redis (one extra env var).
 *
 * Performance: 0 DB calls, O(1) lookup, < 0.1ms per check.
 */

interface WindowEntry {
  count: number;
  resetAt: number; // epoch ms when the window expires
}

// Module-level store — lives for the lifetime of the serverless function instance
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

// ─── Result type ──────────────────────────────────────────────────────────────

export interface RateLimitResult {
  /** Whether the request is allowed through */
  success: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Seconds until the window resets (useful for Retry-After header) */
  retryAfter: number;
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Sliding-window rate limiter (in-memory, zero DB cost).
 *
 * @param identifier  - Unique key, e.g. `"orders_POST_192.168.1.1"`
 * @param limit       - Max requests allowed in the window
 * @param windowSecs  - Window size in seconds
 */
export function rateLimit(
  identifier: string,
  limit: number,
  windowSecs: number
): RateLimitResult {
  try {
    ensurePruner();

    const now = Date.now();
    const existing = store.get(identifier);

    // Window expired or first request — start a fresh window
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowSecs * 1000;
      store.set(identifier, { count: 1, resetAt });
      return { success: true, remaining: limit - 1, retryAfter: 0 };
    }

    // Within window — check count
    if (existing.count >= limit) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      return { success: false, remaining: 0, retryAfter };
    }

    existing.count += 1;
    return {
      success: true,
      remaining: limit - existing.count,
      retryAfter: 0,
    };
  } catch (err) {
    // Fail open: if the rate limiter itself fails, allow the request
    console.error("[rateLimit] Critical failure:", err);
    return { success: true, remaining: 1, retryAfter: 0 };
  }
}


/**
 * Returns standard rate-limit response headers (RFC 6585).
 * Attach to 429 responses so clients can implement proper backoff.
 *
 * Usage:
 *   return NextResponse.json({ error: "..." }, {
 *     status: 429,
 *     headers: rateLimitHeaders(result, 15),
 *   });
 */
export function rateLimitHeaders(
  result: RateLimitResult,
  limit: number
): Record<string, string> {
  return {
    "Retry-After":           String(result.retryAfter),
    "X-RateLimit-Limit":     String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
  };
}

// ─── Typed preset results ─────────────────────────────────────────────────────
// Each named function returns both the result and the limit so callers can
// pass both to rateLimitHeaders() without hard-coding the number twice.

export interface RateLimitPresetResult extends RateLimitResult {
  limit: number;
}

function wrapPreset(result: RateLimitResult, limit: number): RateLimitPresetResult {
  return { ...result, limit };
}

export function rateLimitOrders(ip: string): RateLimitPresetResult {
  return wrapPreset(rateLimit(`orders_post_${ip}`, 15, 60), 15);
}

export function rateLimitOrdersGet(ip: string): RateLimitPresetResult {
  return wrapPreset(rateLimit(`orders_get_${ip}`, 30, 60), 30);
}

export function rateLimitSessions(ip: string): RateLimitPresetResult {
  return wrapPreset(rateLimit(`sessions_post_${ip}`, 10, 60), 10);
}

export function rateLimitPresign(ip: string): RateLimitPresetResult {
  return wrapPreset(rateLimit(`presign_post_${ip}`, 20, 3600), 20);
}

export function rateLimitAuth(ip: string): RateLimitPresetResult {
  return wrapPreset(rateLimit(`auth_${ip}`, 10, 300), 10);
}
