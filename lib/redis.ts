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

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
let _initialized = false;

function getRedis(): Redis | null {
  if (_initialized) return _redis;
  _initialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("[redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set. Using in-memory fallback.");
    return null;
  }

  try {
    _redis = new Redis({ url, token });
  } catch (err) {
    console.warn("[redis] Failed to initialize Upstash Redis client:", err);
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
