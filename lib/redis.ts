/**
 * Redis client — powered by Upstash Redis (HTTP-based, edge-compatible).
 *
 * Why Upstash?
 *  - HTTP REST API — works in all Vercel runtimes (Edge + Node.js)
 *  - Serverless-native — no persistent TCP connection, no connection pool issues
 *  - Global replication — low latency from all Vercel regions
 *
 * Setup (5 minutes):
 *  1. Install: npm install @upstash/redis
 *  2. Create a free database at https://console.upstash.com/redis
 *  3. Add to .env.local:
 *       UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
 *       UPSTASH_REDIS_REST_TOKEN=AXxxxx...
 *  4. Add same vars to Vercel project settings → Environment Variables
 *
 * Until these env vars are set (or @upstash/redis is not installed),
 * all Redis calls are graceful no-ops. The in-memory rate limiter and
 * per-instance pricing cache continue as fallbacks — no errors thrown.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisClient = { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown, opts?: { ex?: number }) => Promise<unknown>; del: (key: string) => Promise<unknown> };

let _redis: RedisClient | null = null;
let _initialized = false;

function getRedis(): RedisClient | null {
  if (_initialized) return _redis;
  _initialized = true;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
    // Dynamic require — avoids hard build failure when @upstash/redis is not installed yet
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis") as { Redis: new (opts: { url: string; token: string }) => RedisClient };
    _redis = new Redis({ url, token });
  } catch {
    // Package not yet installed — fail silently, in-memory fallback will be used
    console.warn("[redis] @upstash/redis not installed. Run: npm install @upstash/redis");
  }

  return _redis;
}

/**
 * Get a JSON value from Redis.
 * Returns null on cache miss, Redis unavailability, or parse error.
 */
export async function redisGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    return (await redis.get(key)) as T | null;
  } catch (err) {
    console.warn("[redis] GET failed:", key, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Set a JSON value in Redis with TTL.
 * Silently no-ops if Redis is unavailable.
 */
export async function redisSet(
  key: string,
  value: unknown,
  ttlSeconds = 60
): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    console.warn("[redis] SET failed:", key, err instanceof Error ? err.message : err);
  }
}

/**
 * Delete a key from Redis.
 * Silently no-ops if Redis is unavailable.
 */
export async function redisDel(key: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(key);
  } catch (err) {
    console.warn("[redis] DEL failed:", key, err instanceof Error ? err.message : err);
  }
}
