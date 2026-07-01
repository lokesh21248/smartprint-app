/**
 * Structured logging utilities with request correlation.
 *
 * Why correlation IDs?
 *   Under load, Vercel logs interleave lines from concurrent requests.
 *   Without a shared ID, tracing a single order through presign → POST /api/orders
 *   → background tasks is impossible. With requestId, you can grep a single thread.
 *
 * Usage:
 *   import { createLogger } from "@/lib/utils/logger";
 *   const log = createLogger(request);            // in API route handlers
 *   log.info("order_placed", { orderId, shopId }); // structured JSON log line
 *   log.error("insert_failed", error);
 *
 * Log format (JSON, one line per event):
 *   { "level": "info", "requestId": "abc123", "event": "order_placed", "orderId": "...", ... }
 */

export interface Logger {
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, error?: unknown, data?: Record<string, unknown>): void;
  requestId: string;
}

/**
 * Creates a request-scoped structured logger.
 * Reads the X-Request-ID header set by middleware; falls back to a new UUID.
 */
export function createLogger(request: Request): Logger {
  const requestId =
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    crypto.randomUUID().slice(0, 12);

  function format(
    level: string,
    event: string,
    data?: Record<string, unknown>
  ): string {
    return JSON.stringify({
      level,
      requestId,
      event,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  return {
    requestId,
    info(event, data) {
      console.log(format("info", event, data));
    },
    warn(event, data) {
      console.warn(format("warn", event, data));
    },
    error(event, error, data) {
      const errorData =
        error instanceof Error
          ? { errorMessage: error.message, errorName: error.name }
          : error != null
          ? { errorRaw: String(error) }
          : {};
      console.error(format("error", event, { ...errorData, ...data }));
    },
  };
}
