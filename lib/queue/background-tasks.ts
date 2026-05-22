/**
 * background-tasks.ts
 *
 * Lightweight fire-and-forget queue for non-critical post-response work.
 *
 * Philosophy:
 * - The HTTP response is returned IMMEDIATELY after the DB insert.
 * - Notifications, analytics, thumbnail generation, and logging run here,
 *   completely decoupled from the user-facing response latency.
 * - Each task is isolated: one failure never affects others.
 * - All errors are logged with a structured prefix for easy log filtering.
 *
 * Usage:
 *   enqueueBackgroundTasks("order-placed", [
 *     () => NotificationService.alertNewOrder(...),
 *     () => trackAnalytics(...),
 *   ]);
 */

export interface BackgroundTask {
  name: string;
  fn: () => Promise<unknown>;
}

/**
 * Enqueue an array of background tasks to run after the response is sent.
 * Uses Promise.allSettled so failures are isolated and logged, never thrown.
 *
 * @param context   - Log prefix (e.g. "order-placed", "order-status-change")
 * @param tasks     - Array of {name, fn} tasks to run concurrently
 */
export function enqueueBackgroundTasks(
  context: string,
  tasks: BackgroundTask[]
): void {
  if (tasks.length === 0) return;

  // We intentionally do NOT await this. It runs after the current call stack
  // clears, so the HTTP response is already sent before these execute.
  void Promise.allSettled(
    tasks.map(async ({ name, fn }) => {
      const t0 = Date.now();
      try {
        await fn();
        console.log(`[bg:${context}] ✅ ${name} (${Date.now() - t0}ms)`);
      } catch (err) {
        console.error(
          `[bg:${context}] ❌ ${name} failed after ${Date.now() - t0}ms:`,
          err instanceof Error ? err.message : err
        );
      }
    })
  );
}

/**
 * Convenience wrapper for a single fire-and-forget task.
 */
export function fireAndForget(name: string, fn: () => Promise<unknown>): void {
  enqueueBackgroundTasks(name, [{ name, fn }]);
}
