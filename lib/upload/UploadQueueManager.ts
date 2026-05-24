/**
 * UploadQueueManager.ts
 *
 * Production-grade, fault-tolerant upload engine for SmartPrint.
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  State machine per file (never undefined transitions):   │
 *   │  idle → preparing → requesting_url → uploading           │
 *   │       ↓               ↓                  ↓              │
 *   │    failed          retrying ←──────── retrying           │
 *   │                       ↓                  ↓              │
 *   │                    paused            completed           │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Key guarantees:
 *  1. Upload lock (mutex) ALWAYS released in finally blocks.
 *  2. Presign fetch wrapped in 15s Promise.race timeout — never hangs.
 *  3. Watchdog aborts stalled TUS uploads after 20s of zero progress.
 *  4. Queue drainer uses a boolean mutex — no concurrent mutation.
 *  5. Exponential backoff: 1s → 2s → 5s → 10s → 20s (5 retries max).
 *  6. Online/offline events pause/resume automatically.
 *  7. Wake Lock acquired on mobile to survive screen lock.
 *  8. Mobile: 1 concurrent upload, 1MB chunks.
 *     Desktop: 3 concurrent uploads, 5MB chunks.
 *  9. All AbortControllers, timers, and event listeners cleaned up on destroy().
 * 10. React state never touched directly — events emitted to host hook.
 *
 * @module lib/upload/UploadQueueManager
 */

"use client";

import * as tus from "tus-js-client";
import { indexedDbStore } from "@/lib/upload/indexedDb";
import { clearStaleTusFingerprints, clearAllTusFingerprints } from "@/lib/upload/tusFingerprint";
import { classifyUploadError } from "@/lib/upload/errorClassifier";
import { compressImageIfNeeded } from "@/lib/upload/compressImage";
import {
  logUploadStart,
  logUploadChunk,
  logUploadSuccess,
  logUploadFailure,
  logRetryAttempt,
  logPresignRequest,
  logPresignResult,
  logCompressionResult,
  logUploadCancelled,
  logNetworkPause,
  logNetworkResume,
} from "@/lib/upload/uploadLogger";
import type { UploadedFile, UploadStatus } from "@/types";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Exponential backoff delays in ms. Length = max retries. */
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000] as const;
const MAX_RETRIES = RETRY_DELAYS_MS.length;

/** Presign fetch timeout — if it exceeds this, we treat it as a retryable error. */
const PRESIGN_TIMEOUT_MS = 15_000;

/** TUS watchdog — if no progress event fires for this long, restart the upload. */
const WATCHDOG_STALL_MS = 20_000;

/** How often the watchdog polls. */
const WATCHDOG_INTERVAL_MS = 5_000;

/** Chunk size: 1MB on mobile, 5MB on desktop. */
function getChunkSize(isMobile: boolean) {
  return isMobile ? 1 * 1024 * 1024 : 5 * 1024 * 1024;
}

/** Concurrent uploads: 1 on mobile, 3 on desktop. */
function getConcurrencyLimit(isMobile: boolean) {
  return isMobile ? 1 : 3;
}

function detectMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 768 || navigator.maxTouchPoints > 1;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Internal state machine state — superset of public UploadStatus. */
type FileState =
  | "idle"
  | "preparing"
  | "requesting_url"
  | "uploading"
  | "retrying"
  | "paused"
  | "completed"
  | "failed";

interface FileEntry {
  id: string;
  file?: File;
  name: string;
  size: number;
  pages: number | null;
  pdfParseFailed: boolean;
  copies: number;
  color: boolean;
  doubleSided: boolean;
  mimeType: string;
  retryAttempt: number;
  state: FileState;
  progress: number;
  storagePath?: string;
  uploadSpeed?: number;
  etaSeconds?: number;
  error?: string;
}

/** Emitted to the React hook whenever any file changes. */
export type QueueEvent =
  | { type: "FILE_UPDATED"; file: UploadedFile }
  | { type: "FILE_ADDED"; file: UploadedFile }
  | { type: "FILE_REMOVED"; id: string }
  | { type: "ONLINE_CHANGED"; online: boolean }
  | { type: "SESSION_CLEARED" };

export type QueueEventListener = (event: QueueEvent) => void;

/** Options passed when constructing the manager. */
export interface QueueManagerOptions {
  shopId: string;
  orderId: string;
}

// ─── UploadQueueManager ────────────────────────────────────────────────────────

export class UploadQueueManager {
  // ── Config ──────────────────────────────────────────────────────────────────
  private readonly _shopId: string;
  private readonly _orderId: string;
  private readonly _isMobile: boolean;
  private readonly _chunkSize: number;
  private readonly _concurrencyLimit: number;

  // ── File registry ────────────────────────────────────────────────────────────
  /** Source of truth for all file state. */
  private _files = new Map<string, FileEntry>();

  // ── Queue processor mutex ────────────────────────────────────────────────────
  /**
   * Prevents concurrent calls to _drainQueue() from double-starting uploads.
   * Set to true while draining; reset in finally.
   */
  private _draining = false;

  // ── Active TUS instances ──────────────────────────────────────────────────────
  /** One TUS Upload instance per active file — scoped to this manager instance. */
  private _tusInstances = new Map<string, InstanceType<typeof tus.Upload>>();

  // ── Per-file abort controllers ────────────────────────────────────────────────
  /**
   * Each upload attempt gets its own AbortController so presign fetches
   * can be cancelled without affecting other files.
   */
  private _abortControllers = new Map<string, AbortController>();

  // ── Watchdog ─────────────────────────────────────────────────────────────────
  private _watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private _lastProgressAt = new Map<string, number>();

  // ── Event listeners ───────────────────────────────────────────────────────────
  private _listeners: Set<QueueEventListener> = new Set();

  // ── Network state ─────────────────────────────────────────────────────────────
  private _online = typeof navigator !== "undefined" ? navigator.onLine : true;

  // ── Wake Lock ─────────────────────────────────────────────────────────────────
  private _wakeLock: WakeLockSentinel | null = null;

  // ── Files being actively processed (not yet resolved) ────────────────────────
  private _activeFileIds = new Set<string>();

  // ── Cleanup refs ─────────────────────────────────────────────────────────────
  private _destroyed = false;
  private readonly _onlineHandler: () => void;
  private readonly _offlineHandler: () => void;
  private readonly _visibilityHandler: () => void;

  // ─────────────────────────────────────────────────────────────────────────────

  constructor(options: QueueManagerOptions) {
    this._shopId = options.shopId;
    this._orderId = options.orderId;
    this._isMobile = detectMobile();
    this._chunkSize = getChunkSize(this._isMobile);
    this._concurrencyLimit = getConcurrencyLimit(this._isMobile);

    // ── Bind handlers once (stable references for removeEventListener) ──────────
    this._onlineHandler = () => this._handleOnline();
    this._offlineHandler = () => this._handleOffline();
    this._visibilityHandler = () => this._handleVisibilityChange();

    if (typeof window !== "undefined") {
      window.addEventListener("online", this._onlineHandler);
      window.addEventListener("offline", this._offlineHandler);
      document.addEventListener("visibilitychange", this._visibilityHandler);
    }

    // ── Watchdog ───────────────────────────────────────────────────────────────
    this._watchdogInterval = setInterval(
      () => this._runWatchdog(),
      WATCHDOG_INTERVAL_MS
    );
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /** Subscribe to queue events. Returns an unsubscribe function. */
  subscribe(listener: QueueEventListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Returns current snapshot of all files as UploadedFile[]. */
  getFiles(): UploadedFile[] {
    return Array.from(this._files.values()).map(this._toUploadedFile);
  }

  /** Returns current online status. */
  get isOnline(): boolean {
    return this._online;
  }

  /**
   * Add new File objects to the queue.
   * Saves binaries to IndexedDB, triggers PDF page parse, starts upload.
   */
  async addFiles(rawFiles: File[]): Promise<void> {
    if (this._destroyed) return;

    for (const rawFile of rawFiles) {
      const id = `file-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
      const isPdf =
        rawFile.type === "application/pdf" ||
        rawFile.name.toLowerCase().endsWith(".pdf");

      const entry: FileEntry = {
        id,
        file: rawFile,
        name: rawFile.name,
        size: rawFile.size,
        pages: isPdf ? null : 1,
        pdfParseFailed: false,
        copies: 1,
        color: false,
        doubleSided: isPdf,
        mimeType: rawFile.type || "application/octet-stream",
        retryAttempt: 0,
        state: "preparing",
        progress: 0,
      };

      this._files.set(id, entry);
      this._emit({ type: "FILE_ADDED", file: this._toUploadedFile(entry) });

      // Persist binary to IndexedDB for session recovery
      indexedDbStore.saveFile(id, rawFile).catch((err) =>
        console.warn(`[QueueManager] IndexedDB save failed for ${rawFile.name}:`, err)
      );

      // Parse PDF pages in background (non-blocking)
      if (isPdf) {
        this._parsePdfPages(rawFile).then(({ count, failed }) => {
          this._patch(id, { pages: count, pdfParseFailed: failed });
        });
      }
    }

    // Kick the queue — start any slots that are open
    this._scheduleQueueDrain();
  }

  /** Remove a file. Aborts any active upload cleanly. */
  removeFile(id: string): void {
    const entry = this._files.get(id);
    if (!entry) return;

    logUploadCancelled(entry.name);
    this._abortFileUpload(id);
    this._files.delete(id);
    this._activeFileIds.delete(id);
    indexedDbStore.deleteFile(id).catch(() => {});
    clearStaleTusFingerprints(id);
    this._emit({ type: "FILE_REMOVED", id });

    this._releaseWakeLockIfDone();
  }

  /** Cancel an in-progress upload without removing the file. Sets to failed. */
  cancelUpload(id: string): void {
    const entry = this._files.get(id);
    if (!entry) return;

    logUploadCancelled(entry.name);
    this._abortFileUpload(id);
    this._patch(id, {
      state: "failed",
      progress: 0,
      error: "Upload cancelled.",
    });
    this._activeFileIds.delete(id);
    this._releaseWakeLockIfDone();
  }

  /** Reset a failed file to queued state and re-trigger the drain. */
  retryFile(id: string): void {
    const entry = this._files.get(id);
    if (!entry || entry.state !== "failed") return;

    clearStaleTusFingerprints(id);
    this._patch(id, {
      state: "preparing",
      progress: 0,
      error: undefined,
      retryAttempt: 0,
    });
    this._scheduleQueueDrain();
  }

  /** Retry all failed files. */
  retryAll(): void {
    for (const [id, entry] of this._files) {
      if (entry.state === "failed") this.retryFile(id);
    }
  }

  /** Update print config for a file (copies, color, doubleSided, pages). */
  updateConfig(
    id: string,
    updates: Partial<Pick<FileEntry, "copies" | "color" | "doubleSided" | "pages">>
  ): void {
    this._patch(id, updates);
  }

  /**
   * Reorder files (drag-and-drop). Replaces internal map order.
   * The Map preserves insertion order, so we rebuild it.
   */
  reorder(orderedIds: string[]): void {
    const next = new Map<string, FileEntry>();
    for (const id of orderedIds) {
      const entry = this._files.get(id);
      if (entry) next.set(id, entry);
    }
    this._files = next;
  }

  /**
   * Wait for all files to reach completed or failed state.
   * Returns summary of outcome.
   */
  async waitForAllSettled(): Promise<{
    success: boolean;
    files: UploadedFile[];
    failedCount: number;
  }> {
    return new Promise((resolve) => {
      const check = () => {
        const all = Array.from(this._files.values());
        const settled = all.every(
          (f) => f.state === "completed" || f.state === "failed"
        );
        if (settled) {
          const failedCount = all.filter((f) => f.state === "failed").length;
          resolve({
            success: failedCount === 0,
            files: all.map(this._toUploadedFile),
            failedCount,
          });
        }
      };

      // Check immediately
      check();

      // Otherwise subscribe to events
      const unsub = this.subscribe(() => check());

      // Safety timeout — 10 minutes max wait
      const timeout = setTimeout(() => {
        unsub();
        const all = Array.from(this._files.values());
        const failedCount = all.filter((f) => f.state === "failed").length;
        resolve({
          success: false,
          files: all.map(this._toUploadedFile),
          failedCount: failedCount || 1,
        });
      }, 10 * 60 * 1000);

      // Wrap check with cleanup
      const wrappedUnsub = this.subscribe((event) => {
        check();
        const all = Array.from(this._files.values());
        const settled = all.every(
          (f) => f.state === "completed" || f.state === "failed"
        );
        if (settled) {
          unsub();
          wrappedUnsub();
          clearTimeout(timeout);
          const failedCount = all.filter((f) => f.state === "failed").length;
          resolve({
            success: failedCount === 0,
            files: all.map(this._toUploadedFile),
            failedCount,
          });
        }
      });
    });
  }

  /**
   * Rehydrate session from localStorage + IndexedDB.
   * Called once on mount.
   */
  async rehydrate(savedMetadata: string | null): Promise<void> {
    // Disabled to guarantee the uploader always starts with a clean, empty state on refresh or failed uploads
    return Promise.resolve();
  }

  /** Clear all state, abort all uploads, wipe IndexedDB + localStorage. */
  clearSession(): void {
    // Abort all active uploads
    for (const id of this._files.keys()) {
      this._abortFileUpload(id);
    }
    this._files.clear();
    this._activeFileIds.clear();
    clearAllTusFingerprints();
    localStorage.removeItem("smartprint_upload_metadata");
    indexedDbStore.clear().catch(() => {});
    this._releaseWakeLockIfDone();
    this._emit({ type: "SESSION_CLEARED" });
  }

  /** Destroy the manager — cleanup all listeners, timers, and uploads. */
  destroy(): void {
    this._destroyed = true;

    if (typeof window !== "undefined") {
      window.removeEventListener("online", this._onlineHandler);
      window.removeEventListener("offline", this._offlineHandler);
      document.removeEventListener("visibilitychange", this._visibilityHandler);
    }

    if (this._watchdogInterval !== null) {
      clearInterval(this._watchdogInterval);
      this._watchdogInterval = null;
    }

    for (const id of this._files.keys()) {
      this._abortFileUpload(id);
    }

    this._releaseWakeLockIfDone();
    this._listeners.clear();
  }

  // ─── Queue Drain ──────────────────────────────────────────────────────────────

  /** Schedule a drain on the next microtask (debounce rapid calls). */
  private _scheduleQueueDrain(): void {
    Promise.resolve().then(() => this._drainQueue());
  }

  /**
   * Core queue processor.
   * Mutex-guarded: only one invocation runs at a time.
   * Launches up to CONCURRENCY_LIMIT uploads from "preparing" files.
   */
  private async _drainQueue(): Promise<void> {
    if (this._draining || this._destroyed) return;
    if (!this._online) return; // Wait for online event

    this._draining = true;
    try {
      const activeCount = this._activeFileIds.size;
      const slotsAvailable = this._concurrencyLimit - activeCount;
      if (slotsAvailable <= 0) return;

      const preparingFiles = Array.from(this._files.values()).filter(
        (f) => f.state === "preparing" && !this._activeFileIds.has(f.id)
      );

      const toStart = preparingFiles.slice(0, slotsAvailable);

      for (const entry of toStart) {
        this._activeFileIds.add(entry.id);
        // Fire and forget — completion/failure handled inside _processFile
        this._processFile(entry.id).catch((err) => {
          console.error(`[QueueManager] Unhandled error in _processFile(${entry.name}):`, err);
        });
      }
    } finally {
      this._draining = false;
    }
  }

  // ─── File Processing ──────────────────────────────────────────────────────────

  /**
   * Full upload lifecycle for one file.
   * Handles: compression → presign → TUS upload → retry loop.
   * ALWAYS removes from _activeFileIds in finally.
   */
  private async _processFile(id: string): Promise<void> {
    const entry = this._files.get(id);
    if (!entry || entry.state === "completed" || entry.state === "failed") return;

    // Point 6: Strict Mutex Lock
    if (this._activeFileIds.has(id) && entry.state !== "retrying") {
      return;
    }

    const startedAt = Date.now();
    let attempt = 0;

    try {
      await this._acquireWakeLock();

      // ── Step 1: Compress image if needed ─────────────────────────────────────
      const compressed = await this._maybeCompress(id);
      if (!compressed) return; // File removed or access revoked

      // ── Step 2: Retry loop ────────────────────────────────────────────────────
      while (attempt <= MAX_RETRIES) {
        if (this._destroyed) return;
        if (!this._files.has(id)) return; // File was removed mid-upload

        const entry = this._files.get(id)!;

        // Check if manually cancelled
        if (entry.state === "failed" || entry.state === "completed") return;

        // ── Wait for network ────────────────────────────────────────────────────
        await this._waitForNetwork(id);
        if (!this._files.has(id)) return;

        // ── Clear stale fingerprints + force fresh token on every attempt ───────
        clearStaleTusFingerprints(id);

        // ── Step 2a: Presign (with 15s timeout) ──────────────────────────────────
        this._patch(id, {
          state: "requesting_url",
          error: attempt > 0 ? `Retrying… (attempt ${attempt}/${MAX_RETRIES})` : "Preparing upload…",
        });

        const presignResult = await this._fetchPresignWithTimeout(id);
        if (!presignResult) return; // Cancelled or destroyed

        if (presignResult.alreadyExists) {
          // File already uploaded — mark complete
          this._patch(id, {
            state: "completed",
            progress: 100,
            storagePath: presignResult.storagePath,
            error: undefined,
          });
          logUploadSuccess(entry.name, entry.size, presignResult.storagePath, Date.now() - startedAt);
          this._scheduleQueueDrain();
          return;
        }

        // ── Step 2b: TUS Upload ───────────────────────────────────────────────────
        this._patch(id, {
          state: "uploading",
          error: undefined,
        });

        logUploadStart(entry.name, entry.size, attempt + 1);

        const uploadResult = await this._runTusUpload(id, presignResult.token, presignResult.storagePath, startedAt);

        if (uploadResult === "success") {
          this._scheduleQueueDrain();
          return;
        }

        if (uploadResult === "cancelled") {
          return;
        }

        // uploadResult === "error" — fall through to retry
        attempt++;

        if (attempt > MAX_RETRIES) {
          logUploadFailure(
            entry.name,
            "MAX_RETRIES_EXCEEDED",
            "Upload failed after maximum retries.",
            attempt
          );
          toast.error(`Upload failed for "${entry.name}" after ${MAX_RETRIES} attempts. Please select the file again.`);
          this.removeFile(id);
          return;
        }

        // ── Backoff ───────────────────────────────────────────────────────────────
        const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
        logRetryAttempt(entry.name, attempt, delay);

        this._patch(id, {
          state: "retrying",
          error: `Retrying… (attempt ${attempt}/${MAX_RETRIES})`,
        });

        await this._sleep(delay, id);
        if (!this._files.has(id)) return;
      }
    } catch (err) {
      // Catch-all — should not normally fire since all paths are handled above
      const entry = this._files.get(id);
      if (entry && entry.state !== "completed") {
        const classified = classifyUploadError(err, "general");
        logUploadFailure(entry.name, classified.code, classified.userMessage, attempt);
        toast.error(`Upload failed for "${entry.name}": ${classified.userMessage}. Please select the file again.`);
        this.removeFile(id);
      }
    } finally {
      // ── CRITICAL: ALWAYS release the active slot ──────────────────────────────
      this._activeFileIds.delete(id);
      this._abortControllers.delete(id);
      this._lastProgressAt.delete(id);
      this._releaseWakeLockIfDone();

      // Kick queue for next file
      this._scheduleQueueDrain();
    }
  }

  // ─── Compression ─────────────────────────────────────────────────────────────

  private async _maybeCompress(id: string): Promise<boolean> {
    const entry = this._files.get(id);
    if (!entry) return false;

    // Ensure we have the binary
    let fileToUpload = entry.file;
    if (!fileToUpload) {
      const dbFile = await indexedDbStore.getFile(id);
      if (!dbFile) {
        toast.error(`Device revoked file access for "${entry.name}". Please select the file again.`);
        this.removeFile(id);
        return false;
      }
      fileToUpload = dbFile;
      this._patch(id, { file: dbFile });
    }

    if (!fileToUpload.type.startsWith("image/")) return true;

    this._patch(id, { state: "preparing", error: "Optimizing image…" });

    try {
      const compResult = await compressImageIfNeeded(fileToUpload, 500 * 1024);
      logCompressionResult(
        entry.name,
        compResult.originalSizeBytes,
        compResult.finalSizeBytes,
        compResult.compressed
      );
      if (compResult.compressed) {
        await indexedDbStore.saveFile(id, compResult.file);
        this._patch(id, {
          file: compResult.file,
          size: compResult.file.size,
          mimeType: compResult.file.type,
          error: undefined,
        });
      } else {
        this._patch(id, { error: undefined });
      }
    } catch (err) {
      console.warn("[QueueManager] Compression error — proceeding with original:", err);
      this._patch(id, { error: undefined });
    }

    return true;
  }

  // ─── Presign ──────────────────────────────────────────────────────────────────

  private async _fetchPresignWithTimeout(id: string): Promise<{
    token: string;
    storagePath: string;
    alreadyExists: false;
  } | {
    alreadyExists: true;
    storagePath: string;
  } | null> {
    const entry = this._files.get(id);
    if (!entry || !entry.file) return null;

    // Create a new AbortController for this presign attempt
    const controller = new AbortController();
    this._abortControllers.set(id, controller);

    logPresignRequest(entry.name, entry.file.size);

    try {
      const result = await Promise.race([
        // The actual presign fetch
        this._fetchPresign(id, controller.signal),

        // Hard timeout — if presign hangs for 15s, reject
        new Promise<never>((_, reject) => {
          const t = setTimeout(
            () => reject(new Error("PRESIGN_TIMEOUT")),
            PRESIGN_TIMEOUT_MS
          );
          // Clean up timeout if aborted
          controller.signal.addEventListener("abort", () => clearTimeout(t));
        }),
      ]);

      logPresignResult(entry.name, true);
      return result;
    } catch (err) {
      if (controller.signal.aborted) return null; // Upload was cancelled

      const classified = classifyUploadError(err, "presign");
      logPresignResult(entry.name, false, classified.userMessage);

      // Add defensive protection: remove failed file immediately on URL creation failure, show toast, and require manual re-selection
      toast.error(`Failed to generate upload URL for "${entry.name}": ${classified.userMessage}. Please select the file again.`);
      this.removeFile(id);
      return null;
    }
  }

  private async _fetchPresign(
    id: string,
    signal: AbortSignal
  ): Promise<{
    token: string;
    storagePath: string;
    alreadyExists: false;
  } | {
    alreadyExists: true;
    storagePath: string;
  }> {
    const entry = this._files.get(id);
    if (!entry || !entry.file) throw new Error("FILE_ACCESS_REVOKED");

    // Point 4: Mobile Fetch Defense with AbortController and Timeout (15s)
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 15000);

    // Chain signals
    signal.addEventListener("abort", () => {
      controller.abort();
    });

    try {
      const res = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: this._shopId,
          orderId: this._orderId,
          fileName: entry.file.name,
          fileSize: entry.file.size,
          mimeType: entry.file.type,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Point 7: Validate response JSON (Vercel HTML check)
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Invalid API response format (expected JSON)");
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error (${res.status})`);
      }

      const data = await res.json() as {
        alreadyExists?: boolean;
        storagePath: string;
        token?: string;
      };

      if (data.alreadyExists) {
        return { alreadyExists: true, storagePath: data.storagePath };
      }

      if (!data.token) throw new Error("Presign response missing token");

      return { alreadyExists: false, token: data.token, storagePath: data.storagePath };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  // ─── TUS Upload ───────────────────────────────────────────────────────────────

  /**
   * Run a single TUS upload attempt.
   * Returns:
   *   "success"   — upload completed
   *   "cancelled" — user cancelled or file removed
   *   "error"     — retriable error (outer loop will retry)
   */
  private _runTusUpload(
    id: string,
    token: string,
    storagePath: string,
    startedAt: number
  ): Promise<"success" | "cancelled" | "error"> {
    return new Promise((resolve) => {
      const entry = this._files.get(id);
      if (!entry?.file) {
        resolve("cancelled");
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        toast.error(`Storage configuration error for "${entry.name}". Please contact support.`);
        this.removeFile(id);
        resolve("cancelled");
        return;
      }

      const endpoint = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;

      // Speed tracking
      let lastBytesSent = 0;
      let lastTimestamp = Date.now();
      let speedBytesPerSec = 0;

      const upload = new tus.Upload(entry.file, {
        endpoint,
        retryDelays: [], // We manage retries in the outer loop
        chunkSize: this._chunkSize,
        headers: {
          "x-signature": token,
          "x-upsert": "true",
        },
        metadata: {
          bucketName: "order-files",
          objectName: storagePath,
          contentType: entry.file.type || "application/octet-stream",
        },
        // Bug 4 fix: unique fingerprint per upload slot prevents collisions
        fingerprint: (_file, opts) =>
          Promise.resolve(
            `tus-${id}-${opts?.endpoint ?? ""}-${entry.file!.size}`
          ),
        onBeforeRequest: () => {
          // Refresh watchdog timer on every request
          this._lastProgressAt.set(id, Date.now());
          if (!navigator.onLine) logNetworkPause(entry.name);
        },
        onProgress: (bytesSent: number, bytesTotal: number) => {
          const pct = bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0;
          logUploadChunk(entry.name, pct, bytesSent, bytesTotal);

          // Refresh watchdog
          this._lastProgressAt.set(id, Date.now());

          // Calculate speed
          const now = Date.now();
          const elapsed = (now - lastTimestamp) / 1000;
          if (elapsed > 0.5) {
            speedBytesPerSec = Math.round((bytesSent - lastBytesSent) / elapsed);
            lastBytesSent = bytesSent;
            lastTimestamp = now;
          }

          // ETA
          const remaining = bytesTotal - bytesSent;
          const eta = speedBytesPerSec > 0 ? Math.ceil(remaining / speedBytesPerSec) : undefined;

          this._patch(id, {
            state: "uploading",
            progress: pct,
            uploadSpeed: speedBytesPerSec,
            etaSeconds: eta,
            error: undefined,
          });
        },
        onSuccess: () => {
          const durationMs = Date.now() - startedAt;
          logUploadSuccess(entry.name, entry.file!.size, storagePath, durationMs);

          // Release blob reference to free mobile memory
          this._patch(id, {
            state: "completed",
            progress: 100,
            storagePath,
            uploadSpeed: undefined,
            etaSeconds: undefined,
            error: undefined,
            // Don't null out file — IndexedDB cleanup happens on clearSession
          });

          this._tusInstances.delete(id);
          resolve("success");
        },
        onError: (err) => {
          // abort(false) = close socket but preserve fingerprint for genuine resume
          upload.abort(false).catch(() => {});
          this._tusInstances.delete(id);

          const classified = classifyUploadError(err, "tus");

          if (!classified.retryable) {
            logUploadFailure(entry.name, classified.code, classified.userMessage, 0);
            toast.error(`Non-retryable upload error for "${entry.name}": ${classified.userMessage}. Please select the file again.`);
            this.removeFile(id);
            resolve("cancelled"); // Non-retryable — don't loop
            return;
          }

          this._patch(id, { error: classified.userMessage });
          resolve("error");
        },
        onShouldRetry: () => false, // Let our outer loop handle retries
      });

      this._tusInstances.set(id, upload);

      // Start fresh — fingerprints were cleared before this call
      upload.start();
    });
  }

  // ─── Watchdog ─────────────────────────────────────────────────────────────────

  private _runWatchdog(): void {
    if (this._destroyed) return;

    const now = Date.now();

    for (const [id, entry] of this._files) {
      if (entry.state !== "uploading") continue;

      const lastProgress = this._lastProgressAt.get(id) ?? now;
      if (now - lastProgress > WATCHDOG_STALL_MS) {
        console.warn(
          `[QueueManager:Watchdog] Upload stalled for "${entry.name}" — ${now - lastProgress}ms since last progress. Aborting for retry.`
        );
        this._abortFileUpload(id);
        this._patch(id, {
          state: "retrying",
          error: "Upload stalled — reconnecting…",
        });
        // The _processFile loop is awaiting _runTusUpload which will reject, triggering retry
      }
    }
  }

  // ─── Network events ───────────────────────────────────────────────────────────

  private _handleOnline(): void {
    this._online = true;
    logNetworkResume("*");
    this._emit({ type: "ONLINE_CHANGED", online: true });

    // Reset watchdog baselines so we don't false-abort uploads that were paused
    const now = Date.now();
    for (const id of this._activeFileIds) {
      this._lastProgressAt.set(id, now);
    }

    // Re-queue paused files
    for (const [id, entry] of this._files) {
      if (entry.state === "paused") {
        this._patch(id, { state: "preparing", error: undefined });
      }
    }

    this._scheduleQueueDrain();
  }

  private _handleOffline(): void {
    this._online = false;
    logNetworkPause("*");
    this._emit({ type: "ONLINE_CHANGED", online: false });

    // Abort active TUS uploads — they'll be re-queued when online
    for (const [id, entry] of this._files) {
      if (entry.state === "uploading" || entry.state === "requesting_url") {
        this._abortFileUpload(id);
        this._patch(id, {
          state: "paused",
          error: "Waiting for network…",
        });
        this._activeFileIds.delete(id);
      }
    }
  }

  private _handleVisibilityChange(): void {
    if (document.hidden) {
      // Point 9: Foreground visibility defense — pause uploads immediately when app hidden
      console.log("[QueueManager] App hidden (tab suspended) — pausing all active uploads.");
      for (const [id, entry] of this._files) {
        if (entry.state === "uploading" || entry.state === "requesting_url") {
          this._abortFileUpload(id);
          this._patch(id, {
            state: "paused",
            error: "Uploads suspended in background…",
          });
          this._activeFileIds.delete(id);
        }
      }
      this._releaseWakeLockIfDone();
    } else if (document.visibilityState === "visible" && this._online) {
      console.log("[QueueManager] App visible — resuming all suspended uploads.");
      // Reset watchdog baselines — tab may have been hidden for >20s
      const now = Date.now();
      for (const id of this._activeFileIds) {
        this._lastProgressAt.set(id, now);
      }

      // Re-queue any paused/starved files
      for (const [id, entry] of this._files) {
        if (entry.state === "paused" || entry.state === "retrying") {
          if (!this._activeFileIds.has(id)) {
            this._patch(id, { state: "preparing", error: undefined });
          }
        }
      }

      this._scheduleQueueDrain();
    }
  }

  // ─── Wake Lock ────────────────────────────────────────────────────────────────

  private async _acquireWakeLock(): Promise<void> {
    if (this._wakeLock !== null) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    try {
      this._wakeLock = await (navigator as Navigator & {
        wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> };
      }).wakeLock.request("screen");

      this._wakeLock.addEventListener("release", () => {
        this._wakeLock = null;
      });

      console.log("[QueueManager] Wake Lock acquired");
    } catch {
      // Wake Lock not available (e.g., document not focused) — silent fail
    }
  }

  private _releaseWakeLockIfDone(): void {
    if (this._activeFileIds.size > 0) return;
    if (this._wakeLock === null) return;

    this._wakeLock.release().catch(() => {});
    this._wakeLock = null;
    console.log("[QueueManager] Wake Lock released — all uploads done");
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /** Abort the TUS upload and presign fetch for a file. */
  private _abortFileUpload(id: string): void {
    const tusInstance = this._tusInstances.get(id);
    if (tusInstance) {
      tusInstance.abort(false).catch(() => {});
      this._tusInstances.delete(id);
    }

    const controller = this._abortControllers.get(id);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(id);
    }
  }

  /**
   * Wait until navigator.onLine is true.
   * Polls every 2s with slight jitter to avoid thundering herd on reconnect.
   */
  private async _waitForNetwork(id: string): Promise<void> {
    while (!navigator.onLine) {
      if (!this._files.has(id)) return;
      this._patch(id, { state: "paused", error: "Waiting for network…" });
      await this._sleep(2000 + Math.random() * 500, id);
    }
    // Give OS 300ms to assign a socket after network switch
    await this._sleep(300, id);
  }

  /**
   * Sleep for ms, but return early if the file is removed.
   * Uses a simple Promise + setTimeout (no AbortController needed here).
   */
  private _sleep(ms: number, id?: string): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      if (id) {
        // If the file is removed while sleeping, resolve immediately
        const check = setInterval(() => {
          if (!this._files.has(id)) {
            clearTimeout(t);
            clearInterval(check);
            resolve();
          }
        }, 200);
        setTimeout(() => clearInterval(check), ms + 100);
      }
    });
  }

  private async _parsePdfPages(file: File): Promise<{ count: number; failed: boolean }> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      return { count: pdfDoc.getPageCount(), failed: false };
    } catch {
      return { count: 1, failed: true };
    }
  }

  /** Patch a file entry and emit FILE_UPDATED. */
  private _patch(id: string, updates: Partial<FileEntry>): void {
    const entry = this._files.get(id);
    if (!entry) return;

    const next = { ...entry, ...updates };
    this._files.set(id, next);
    this._emit({ type: "FILE_UPDATED", file: this._toUploadedFile(next) });

    // Persist metadata to localStorage for session recovery
    this._persistMetadata();
  }

  /** Map internal FileEntry to the public UploadedFile shape. */
  private _toUploadedFile = (entry: FileEntry): UploadedFile => {
    const statusMap: Record<FileState, UploadStatus> = {
      idle: "pending",
      preparing: "compressing",
      requesting_url: "processing",
      uploading: "uploading",
      retrying: "pending",
      paused: "pending",
      completed: "completed",
      failed: "failed",
    };

    return {
      id: entry.id,
      file: entry.file,
      name: entry.name,
      size: entry.size,
      pages: entry.pages,
      pdfParseFailed: entry.pdfParseFailed,
      progress: entry.progress,
      status: statusMap[entry.state],
      storagePath: entry.storagePath,
      error: entry.error,
      copies: entry.copies,
      color: entry.color,
      doubleSided: entry.doubleSided,
      mimeType: entry.mimeType,
      retryAttempt: entry.retryAttempt,
      uploadSpeed: entry.uploadSpeed,
      etaSeconds: entry.etaSeconds,
    };
  };

  private _emit(event: QueueEvent): void {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn("[QueueManager] Event listener error:", err);
      }
    }
  }

  private _persistMetadata(): void {
    // Disabled to prevent automatic restoration / state hydration after failures and on refresh/navigation
  }
}
