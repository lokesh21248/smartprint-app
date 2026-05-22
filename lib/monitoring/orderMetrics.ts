/**
 * orderMetrics.ts
 *
 * Lightweight client-side performance monitoring for the order flow.
 *
 * Currently logs to console with structured prefixes.
 * Future: forward to /api/analytics or a third-party APM (PostHog, Sentry perf).
 *
 * Usage:
 *   const tracker = createOrderTracker(shopId);
 *   tracker.markUploadStart();
 *   // ... do upload ...
 *   tracker.markUploadEnd(file.size);
 *   tracker.markInsertStart();
 *   // ... do insert ...
 *   tracker.markInsertEnd();
 *   tracker.markSuccess();   // logs full breakdown
 *   tracker.markFailure('timeout');
 */

export type OrderFailureReason =
  | "timeout"
  | "network"
  | "upload-failed"
  | "insert-failed"
  | "presign-failed"
  | "validation"
  | "unknown";

export interface OrderMetrics {
  shopId: string;
  uploadStartMs?: number;
  uploadEndMs?: number;
  insertStartMs?: number;
  insertEndMs?: number;
  totalStartMs: number;
  retryCount: number;
  fileSizeBytes?: number;
}

export interface OrderTracker {
  markUploadStart: () => void;
  markUploadEnd: (fileSizeBytes: number) => void;
  markInsertStart: () => void;
  markInsertEnd: () => void;
  incrementRetry: () => void;
  markSuccess: () => void;
  markFailure: (reason: OrderFailureReason) => void;
}

export function createOrderTracker(shopId: string): OrderTracker {
  const metrics: OrderMetrics = {
    shopId,
    totalStartMs: Date.now(),
    retryCount: 0,
  };

  return {
    markUploadStart() {
      metrics.uploadStartMs = Date.now();
      console.time("[order:upload]");
    },

    markUploadEnd(fileSizeBytes: number) {
      metrics.uploadEndMs = Date.now();
      metrics.fileSizeBytes = fileSizeBytes;
      console.timeEnd("[order:upload]");

      if (metrics.uploadStartMs) {
        const durationMs = metrics.uploadEndMs - metrics.uploadStartMs;
        const speedKBps = fileSizeBytes / durationMs; // KB/s (rough)
        console.log(
          `[order:metrics] upload: ${(fileSizeBytes / 1024).toFixed(0)}KB in ${durationMs}ms (~${speedKBps.toFixed(0)} KB/s)`
        );
      }
    },

    markInsertStart() {
      metrics.insertStartMs = Date.now();
      console.time("[order:insert]");
    },

    markInsertEnd() {
      metrics.insertEndMs = Date.now();
      console.timeEnd("[order:insert]");
    },

    incrementRetry() {
      metrics.retryCount++;
      console.warn(`[order:metrics] retry #${metrics.retryCount} for shop ${shopId}`);
    },

    markSuccess() {
      const totalMs = Date.now() - metrics.totalStartMs;
      const uploadMs = metrics.uploadStartMs && metrics.uploadEndMs
        ? metrics.uploadEndMs - metrics.uploadStartMs
        : null;
      const insertMs = metrics.insertStartMs && metrics.insertEndMs
        ? metrics.insertEndMs - metrics.insertStartMs
        : null;

      console.log(
        `[order:metrics] ✅ SUCCESS shop=${shopId} total=${totalMs}ms` +
        (uploadMs ? ` upload=${uploadMs}ms` : "") +
        (insertMs ? ` insert=${insertMs}ms` : "") +
        (metrics.retryCount > 0 ? ` retries=${metrics.retryCount}` : "")
      );

      // Future: forward to analytics endpoint
      // void fetch('/api/analytics/order-metrics', { method: 'POST', body: JSON.stringify({ ...metrics, totalMs, success: true }) });
    },

    markFailure(reason: OrderFailureReason) {
      const totalMs = Date.now() - metrics.totalStartMs;
      console.error(
        `[order:metrics] ❌ FAILURE reason=${reason} shop=${shopId} total=${totalMs}ms retries=${metrics.retryCount}`
      );

      // Future: forward to error tracking
      // void fetch('/api/analytics/order-metrics', { method: 'POST', body: JSON.stringify({ ...metrics, totalMs, success: false, reason }) });
    },
  };
}
