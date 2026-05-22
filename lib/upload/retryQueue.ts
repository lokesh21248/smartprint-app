/**
 * retryQueue.ts
 *
 * A lightweight, singleton background retry queue for the SmartPrint upload pipeline.
 *
 * When an upload fails due to network issues, it's automatically enqueued here.
 * The queue drains automatically when the network comes back online.
 *
 * Features:
 *  - Exponential backoff per entry: 500ms → 1s → 3s → 5s → give up (4 retries max)
 *  - Network-aware: pauses when offline, resumes on 'online' event
 *  - Deduplication: each fileId can only have one pending retry
 *  - Cancellation: remove a file from the queue at any time
 *  - Zero dependencies
 */

export interface RetryEntry {
  fileId: string;
  fileName: string;
  retryFn: () => Promise<void>;
  attempt: number;
  scheduledAt: number;
  timerId?: ReturnType<typeof setTimeout>;
}

const BACKOFF_DELAYS_MS = [500, 1_000, 3_000, 5_000] as const;
const MAX_AUTO_RETRIES = BACKOFF_DELAYS_MS.length;

type QueueEventType = "enqueued" | "started" | "succeeded" | "failed" | "exhausted" | "cancelled";
type QueueListener = (event: QueueEventType, fileId: string, attempt: number) => void;

// ─── Singleton Queue ───────────────────────────────────────────────────────────

class UploadRetryQueue {
  private queue = new Map<string, RetryEntry>();
  private isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  private listeners: QueueListener[] = [];

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleOnline());
      window.addEventListener("offline", () => this.handleOffline());
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Enqueue a file for automatic retry.
   * If the file is already queued, the existing entry is replaced (reset attempt count).
   */
  enqueue(fileId: string, fileName: string, retryFn: () => Promise<void>): void {
    // Cancel any existing timer for this file
    this.cancel(fileId);

    const entry: RetryEntry = {
      fileId,
      fileName,
      retryFn,
      attempt: 0,
      scheduledAt: Date.now(),
    };

    this.queue.set(fileId, entry);
    this.emit("enqueued", fileId, 0);
    this.scheduleNext(fileId);
  }

  /**
   * Remove a file from the retry queue (on manual retry, cancel, or success).
   */
  cancel(fileId: string): void {
    const entry = this.queue.get(fileId);
    if (entry) {
      if (entry.timerId !== undefined) {
        clearTimeout(entry.timerId);
      }
      this.queue.delete(fileId);
      this.emit("cancelled", fileId, entry.attempt);
    }
  }

  /**
   * Returns true if the file is currently in the retry queue.
   */
  has(fileId: string): boolean {
    return this.queue.has(fileId);
  }

  /**
   * Returns the number of entries currently queued.
   */
  get size(): number {
    return this.queue.size;
  }

  /**
   * Subscribe to queue events for logging / UI updates.
   */
  subscribe(listener: QueueListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private scheduleNext(fileId: string): void {
    const entry = this.queue.get(fileId);
    if (!entry) return;

    if (entry.attempt >= MAX_AUTO_RETRIES) {
      this.queue.delete(fileId);
      this.emit("exhausted", fileId, entry.attempt);
      console.warn(`[RetryQueue] ${entry.fileName}: exhausted ${MAX_AUTO_RETRIES} auto-retries`);
      return;
    }

    const delayMs = BACKOFF_DELAYS_MS[entry.attempt] ?? BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1];

    // If offline, don't schedule — we'll drain on reconnect
    if (!this.isOnline) {
      console.log(`[RetryQueue] ${entry.fileName}: offline — will retry when reconnected`);
      return;
    }

    console.log(
      `[RetryQueue] ${entry.fileName}: scheduling attempt ${entry.attempt + 1}/${MAX_AUTO_RETRIES} in ${delayMs}ms`
    );

    const timerId = setTimeout(() => this.execute(fileId), delayMs);
    this.queue.set(fileId, { ...entry, timerId });
  }

  private async execute(fileId: string): Promise<void> {
    const entry = this.queue.get(fileId);
    if (!entry) return; // Was cancelled while waiting

    // Don't retry if offline
    if (!this.isOnline) {
      this.queue.set(fileId, { ...entry, timerId: undefined });
      return;
    }

    const nextAttempt = entry.attempt + 1;
    this.queue.set(fileId, { ...entry, attempt: nextAttempt, timerId: undefined });
    this.emit("started", fileId, nextAttempt);

    console.log(`[RetryQueue] ${entry.fileName}: executing attempt ${nextAttempt}`);

    try {
      await entry.retryFn();
      // Success — remove from queue
      this.queue.delete(fileId);
      this.emit("succeeded", fileId, nextAttempt);
      console.log(`[RetryQueue] ${entry.fileName}: succeeded on attempt ${nextAttempt}`);
    } catch {
      // Still failing — schedule the next attempt if not exhausted
      const updatedEntry = this.queue.get(fileId);
      if (updatedEntry) {
        this.emit("failed", fileId, nextAttempt);
        this.scheduleNext(fileId);
      }
    }
  }

  private handleOnline(): void {
    this.isOnline = true;
    if (this.queue.size === 0) return;

    console.log(`[RetryQueue] Back online — draining ${this.queue.size} queued retries`);

    // Re-schedule all entries that weren't already timed
    for (const [fileId, entry] of this.queue.entries()) {
      if (entry.timerId === undefined) {
        // Reset to attempt 0 on reconnect for a fresh start
        this.queue.set(fileId, { ...entry, attempt: 0 });
        this.scheduleNext(fileId);
      }
    }
  }

  private handleOffline(): void {
    this.isOnline = false;
    console.log("[RetryQueue] Offline — pausing all queued retries");

    // Clear all scheduled timers (but keep entries in queue)
    for (const [fileId, entry] of this.queue.entries()) {
      if (entry.timerId !== undefined) {
        clearTimeout(entry.timerId);
        this.queue.set(fileId, { ...entry, timerId: undefined });
      }
    }
  }

  private emit(event: QueueEventType, fileId: string, attempt: number): void {
    this.listeners.forEach((l) => {
      try {
        l(event, fileId, attempt);
      } catch (err) {
        console.warn("[RetryQueue] listener error:", err);
      }
    });
  }
}

// Export a singleton instance
export const uploadRetryQueue = new UploadRetryQueue();
