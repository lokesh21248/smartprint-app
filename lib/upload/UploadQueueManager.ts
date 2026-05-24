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
import { classifyUploadError, StructuredUploadError } from "@/lib/upload/errorClassifier";
import { validateUploadFile } from "@/lib/upload/fileValidation";
import { getDiagnosticsSnapshot, logUploadDiagnostics } from "@/lib/upload/uploadDiagnostics";
import {
  logUploadStart,
  logUploadChunk,
  logUploadSuccess,
  logUploadFailure,
  logRetryAttempt,
  logPresignRequest,
  logPresignResult,
  logUploadCancelled,
  logNetworkPause,
  logNetworkResume,
} from "@/lib/upload/uploadLogger";
import type { UploadedFile, UploadStatus } from "@/types";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Exponential backoff delays in ms. Length = max retries. */
const RETRY_DELAYS_MS = [0, 1000, 3000, 5000, 10000, 20000] as const;
const MAX_RETRIES = 5;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 15000
): Promise<T> {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("INIT_TIMEOUT")), timeoutMs)
    ),
  ]) as Promise<T>;
}



/** TUS watchdog — if no progress event fires for this long, restart the upload. */
const WATCHDOG_STALL_MS = 20_000;

/** How often the watchdog polls. */
const WATCHDOG_INTERVAL_MS = 5_000;

/** Chunk size optimization based on connection speed for weak mobile networks (Point 7) */
function getChunkSize(isMobile: boolean): number {
  if (!isMobile) return 5 * 1024 * 1024; // 5MB on desktop
  return 2 * 1024 * 1024; // Always 2MB on mobile for max stability and network resilience (Fix 9)
}

/** Concurrent uploads: 1 on mobile (ultra-stable, maximum reliability), 2 on desktop */
function getConcurrencyLimit(isMobile: boolean) {
  return isMobile ? 1 : 2;
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
  | "queued"
  | "requesting_url"
  | "uploading"
  | "verifying"
  | "retrying"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

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
  private _runningProcesses = new Set<string>();
  private _activeResolvers = new Map<string, (result: "success" | "cancelled" | "error") => void>();
  private _fileExecutionIds = new Map<string, number>();
  private _tusRetryTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

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

    console.log(`[QueueManager:Debug] addFiles called with ${rawFiles.length} file(s).`);

    // 1. Prevent immediate upload on file select — mobile browsers need stabilization time
    if (this._isMobile) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const hydratedFiles: File[] = [];

    for (const rawFile of rawFiles) {
      if (this._destroyed) return;

      try {
        // Immediately clone file before any async operations to prevent Android Chrome reference corruption (Point 2)
        const clonedFile = new File([rawFile], rawFile.name, {
          type: rawFile.type,
          lastModified: rawFile.lastModified,
        });

        // 2. Add Mobile File Hydration and Rebuilding Validation
        const hydrated = await this._validateAndHydrateFile(clonedFile);
        
        // 3. Safe File Validation
        await validateUploadFile(hydrated);
        
        hydratedFiles.push(hydrated);
      } catch (err) {
        console.error("UPLOAD_ERROR", {
          filename: rawFile.name,
          size: rawFile.size,
          type: rawFile.type,
          lastModified: rawFile.lastModified,
          mobile: this._isMobile,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
          error: err,
        });

        const classified = classifyUploadError(err);
        toast.error(`"${rawFile.name}" failed: ${classified.userMessage}`);
      }
    }

    if (hydratedFiles.length === 0) return;

    for (const file of hydratedFiles) {
      const id = `file-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

      const entry: FileEntry = {
        id,
        file: file,
        name: file.name,
        size: file.size,
        pages: isPdf ? (this._isMobile ? 1 : null) : 1,
        pdfParseFailed: isPdf && this._isMobile,
        copies: 1,
        color: false,
        doubleSided: isPdf,
        mimeType: file.type || "application/octet-stream",
        retryAttempt: 0,
        state: "preparing",
        progress: 0,
      };

      console.log(`[QueueManager:Debug] Registering file: ${file.name} (id: ${id}, size: ${file.size} bytes).`);

      this._files.set(id, entry);
      this._emit({ type: "FILE_ADDED", file: this._toUploadedFile(entry) });

      // Persist binary to IndexedDB for session recovery
      indexedDbStore.saveFile(id, file).catch((err) =>
        console.warn(`[QueueManager] IndexedDB save failed for ${file.name}:`, err)
      );
    }

    // Kick the queue — start any slots that are open
    this._scheduleQueueDrain();
  }

  /** Remove a file. Aborts any active upload cleanly. */
  removeFile(id: string): void {
    const entry = this._files.get(id);
    if (!entry) return;

    logUploadCancelled(entry.name);

    // Invalidate current execution immediately
    const currentExecId = this._fileExecutionIds.get(id) ?? 0;
    this._fileExecutionIds.set(id, currentExecId + 1);

    this._abortFileUpload(id);
    this._files.delete(id);
    this._activeFileIds.delete(id);
    indexedDbStore.deleteFile(id).catch(() => {});
    clearStaleTusFingerprints(id);
    this._emit({ type: "FILE_REMOVED", id });

    this._releaseWakeLockIfDone();
  }

  /** Cancel an in-progress upload without removing the file. Sets to cancelled. */
  cancelUpload(id: string): void {
    const entry = this._files.get(id);
    if (!entry) return;

    logUploadCancelled(entry.name);

    // Invalidate current execution immediately
    const currentExecId = this._fileExecutionIds.get(id) ?? 0;
    this._fileExecutionIds.set(id, currentExecId + 1);

    this._abortFileUpload(id);
    this._patch(id, {
      state: "cancelled",
      progress: 0,
      error: "Upload cancelled.",
    });
    this._activeFileIds.delete(id);
    this._releaseWakeLockIfDone();
  }

  /** Cancel all active uploads cleanly. */
  cancelAll(): void {
    console.log("[QueueManager] cancelAll() called.");
    for (const id of this._files.keys()) {
      const currentExecId = this._fileExecutionIds.get(id) ?? 0;
      this._fileExecutionIds.set(id, currentExecId + 1);
      this._abortFileUpload(id);
      this._patch(id, {
        state: "cancelled",
        progress: 0,
        error: "Upload cancelled.",
      });
    }
    this._activeFileIds.clear();
    this._releaseWakeLockIfDone();
  }

  /** Clear all state and data. */
  clear(): void {
    console.log("[QueueManager] clear() called.");
    this.clearSession();
  }

  /** Reset a failed file to queued state and re-trigger the drain. */
  retryFile(id: string): void {
    const entry = this._files.get(id);
    if (!entry || (entry.state !== "failed" && entry.state !== "cancelled")) return;

    // Invalidate current execution immediately
    const currentExecId = this._fileExecutionIds.get(id) ?? 0;
    this._fileExecutionIds.set(id, currentExecId + 1);

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
      if (entry.state === "failed" || entry.state === "cancelled") this.retryFile(id);
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
          (f) => f.state === "completed" || f.state === "failed" || f.state === "cancelled"
        );
        if (settled) {
          const failedCount = all.filter((f) => f.state === "failed" || f.state === "cancelled").length;
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
        const failedCount = all.filter((f) => f.state === "failed" || f.state === "cancelled").length;
        resolve({
          success: false,
          files: all.map(this._toUploadedFile),
          failedCount: failedCount || 1,
        });
      }, 10 * 60 * 1000);

      // Wrap check with cleanup
      const wrappedUnsub = this.subscribe(() => {
        check();
        const all = Array.from(this._files.values());
        const settled = all.every(
          (f) => f.state === "completed" || f.state === "failed" || f.state === "cancelled"
        );
        if (settled) {
          unsub();
          wrappedUnsub();
          clearTimeout(timeout);
          const failedCount = all.filter((f) => f.state === "failed" || f.state === "cancelled").length;
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
  async rehydrate(): Promise<void> {
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

    for (const t of this._tusRetryTimeouts.values()) {
      clearTimeout(t);
    }
    this._tusRetryTimeouts.clear();

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
    if (!this._online) {
      console.log("[QueueManager:Debug] Drain queued skipped: Offline.");
      return; // Wait for online event
    }

    this._draining = true;
    try {
      const activeCount = this._activeFileIds.size;
      const slotsAvailable = this._concurrencyLimit - activeCount;
      console.log(`[QueueManager:Debug] _drainQueue: Active: ${activeCount}/${this._concurrencyLimit}. Available: ${slotsAvailable}.`);
      
      if (slotsAvailable <= 0) return;

      const preparingFiles = Array.from(this._files.values()).filter(
        (f) => (f.state === "preparing" || f.state === "queued") && !this._activeFileIds.has(f.id)
      );

      const toStart = preparingFiles.slice(0, slotsAvailable);
      const toQueue = preparingFiles.slice(slotsAvailable);

      // Transition excess files to queued state in UI
      for (const entry of toQueue) {
        if (entry.state === "preparing") {
          this._patch(entry.id, { state: "queued" });
        }
      }

      console.log(`[QueueManager:Debug] _drainQueue: Starting ${toStart.length} file(s).`);

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
    console.log(`[QueueManager:Debug] Starting _processFile for file ${id}`);
    
    // Strict Lock Check: Prevent duplicate initialization of active slots (Point 3)
    if (this._runningProcesses.has(id)) {
      console.warn(`[QueueManager] Blocked duplicate processFile execution for ${id}`);
      this._activeFileIds.delete(id);
      return;
    }
    this._runningProcesses.add(id);

    const execId = (this._fileExecutionIds.get(id) ?? 0) + 1;
    this._fileExecutionIds.set(id, execId);

    // Yield to the event loop/requestAnimationFrame to prevent UI thread blocking on mobile
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
        return;
      }
    }

    let attempt = 0;
    try {
      const entry = this._files.get(id);
      if (!entry || entry.state === "completed" || entry.state === "failed" || entry.state === "cancelled") {
        console.log(`[QueueManager:Debug] _processFile: File ${id} already finished or removed. Releasing slot.`);
        return;
      }

      console.log("[UPLOAD_START]", {
        fileId: id,
        fileName: entry.name,
        fileSize: entry.size,
        bucket: "order-files",
        retryAttempt: attempt,
        online: this._online,
      });
      this._lastProgressAt.set(id, Date.now()); // Set watchdog baseline immediately
      const startedAt = Date.now();

      await this._acquireWakeLock();
      if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
        return;
      }

      // ── Step 1: Ensure binary file is loaded ──────────────────────────────
      let fileToUpload = entry.file;
      if (!fileToUpload) {
        console.log(`[QueueManager:Debug] File binary not in memory, attempting IndexedDB load for "${entry.name}"`);
        const dbFile = await Promise.race([
          indexedDbStore.getFile(id),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("INDEXEDDB_LOAD_TIMEOUT")), 5000)
          )
        ]).catch((err) => {
          console.error(`[QueueManager:Debug] IndexedDB load failed or timed out for "${entry.name}":`, err);
          return null;
        });

        if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
          return;
        }

        if (!dbFile) {
          toast.error(`Your mobile browser may have cleared the file "${entry.name}". Please reselect it.`);
          this.removeFile(id);
          return;
        }
        fileToUpload = dbFile;
      }

      // Re-hydrate and validate file object safely
      try {
        fileToUpload = await this._validateAndHydrateFile(fileToUpload);
        if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
          return;
        }
        this._patch(id, { file: fileToUpload });
        await validateUploadFile(fileToUpload);
      } catch (err) {
        console.error("UPLOAD_ERROR", {
          filename: entry.name,
          size: fileToUpload?.size,
          type: fileToUpload?.type,
          lastModified: fileToUpload?.lastModified,
          mobile: this._isMobile,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
          error: err,
        });
        toast.error(`"${entry.name}" could not be initialized for upload. Please select the file again.`);
        this.removeFile(id);
        return;
      }

      // ── Step 2: Retry loop ────────────────────────────────────────────────────
      while (attempt <= MAX_RETRIES) {
        if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
          return;
        }

        const freshEntry = this._files.get(id)!;
        attempt = freshEntry.retryAttempt;

        // Clean up any existing upload instance before starting a new retry attempt
        this._abortFileUpload(id);

        const currentEntry = this._files.get(id)!;

        // Check if manually cancelled or paused
        if (currentEntry.state === "paused" || currentEntry.state === "failed" || currentEntry.state === "completed" || currentEntry.state === "cancelled") {
          console.log(`[QueueManager:Debug] Exiting _processFile loop for "${currentEntry.name}" due to state: ${currentEntry.state}`);
          return;
        }

        // ── Wait for network ────────────────────────────────────────────────────
        await this._waitForNetwork(id);
        if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
          return;
        }

        // ── Clear stale fingerprints + force fresh token on every attempt ───────
        clearStaleTusFingerprints(id);

        // ── Step 2a: Presign (with 15s timeout) ──────────────────────────────────
        this._patch(id, {
          state: "requesting_url",
          error: attempt > 0 ? "Reconnecting…" : "Preparing upload…",
        });

        const presignResult = await this._generateUploadUrlWithRetry(id);
        if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
          return;
        }

        console.log("[UPLOAD_RESPONSE]", {
          fileId: id,
          fileName: entry.name,
          presignSuccess: !!presignResult,
          storagePath: presignResult?.storagePath,
        });

        if (!presignResult) return; // Cancelled, destroyed or failed

        if (presignResult.alreadyExists) {
          // File already uploaded — mark complete
          this._patch(id, {
            state: "completed",
            progress: 100,
            storagePath: presignResult.storagePath,
            error: "Upload complete",
          });
          logUploadSuccess(entry.name, entry.size, presignResult.storagePath, Date.now() - startedAt);
          console.log(`[UPLOAD_SUCCESS] id=${id}`);
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
        if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
          return;
        }

        if (uploadResult === "success") {
          // PHASE 5: PHYSICAL VERIFICATION STEP
          try {
            console.log("[SUPABASE_VERIFY]", {
              fileId: id,
              fileName: entry.name,
              fileSize: entry.size,
              storagePath: presignResult.storagePath,
            });

            this._patch(id, {
              state: "verifying",
              error: "Verifying upload…",
            });
            
            const verifyRes = await fetch("/api/storage/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                storagePath: presignResult.storagePath,
                expectedSize: entry.size,
              }),
            });

            if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
              return;
            }

            const verifyData = await verifyRes.json().catch(() => null);

            console.log("[SUPABASE_VERIFY_RESPONSE]", verifyData);

            if (!verifyRes.ok || !verifyData || !verifyData.verified) {
              const errMsg = verifyData?.error || `Server verification failed (Status ${verifyRes.status})`;
              throw new Error(errMsg);
            }

            console.log("[UPLOAD_COMPLETE]", {
              fileId: id,
              fileName: entry.name,
              storagePath: presignResult.storagePath,
              size: entry.size,
            });

            console.log(`[QueueManager] Physical upload verified for "${entry.name}" at path: ${presignResult.storagePath}`);
            console.log(`[UPLOAD_SUCCESS] id=${id}`);
            
            // Log successful diagnostics
            const snapshot = getDiagnosticsSnapshot({
              fileId: id,
              fileName: entry.name,
              fileSize: entry.size,
              mimeType: entry.mimeType || "application/octet-stream",
              retryCount: attempt,
              durationMs: Date.now() - startedAt,
              verificationResult: "success",
            });
            logUploadDiagnostics(snapshot, "SUCCESS");

            // Mark progress as 100% and store storagePath
            this._patch(id, {
              progress: 100,
              storagePath: presignResult.storagePath,
              uploadSpeed: undefined,
              etaSeconds: undefined,
              error: undefined,
            });

            // Run post-upload processing (PDF page counting) before transitioning to completed
            await this._runPostUploadProcessing(id);

            this._scheduleQueueDrain();
            return;
          } catch (verifyErr) {
            if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
              return;
            }
            console.error("[SUPABASE_UPLOAD_ERROR]", verifyErr);
            console.error(`[QueueManager] Upload verification failed for "${entry.name}":`, verifyErr);
            
            const freshEntryAfterVerify = this._files.get(id)!;
            attempt = freshEntryAfterVerify.retryAttempt + 1;
            this._patch(id, { retryAttempt: attempt });
            
            const snapshot = getDiagnosticsSnapshot({
              fileId: id,
              fileName: entry.name,
              fileSize: entry.size,
              mimeType: entry.mimeType || "application/octet-stream",
              retryCount: attempt,
              supabaseResponseStatus: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
              verificationResult: "failed",
            });
            logUploadDiagnostics(snapshot, "FAILURE");

            if (attempt > MAX_RETRIES) {
              console.log(`[UPLOAD_FAILED] id=${id} error=${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`);
              this._patch(id, {
                state: "failed",
                error: "Retry failed — tap to retry",
              });
              this._activeFileIds.delete(id);
              this._runningProcesses.delete(id);
              return;
            }
            
            const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
            console.log("[UPLOAD_RETRY]", {
              fileId: id,
              fileName: entry.name,
              retryAttempt: attempt,
              delayMs: delay,
            });
            console.log(`[UPLOAD_RETRY] id=${id} attempt=${attempt}`);
            this._patch(id, {
              state: "retrying",
              error: "Reconnecting…",
            });
            await this._sleep(delay, id);
            if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
              return;
            }
            continue;
          }
        }

        if (uploadResult === "cancelled") {
          console.log(`[UPLOAD_ABORTED] id=${id}`);
          return;
        }

        // uploadResult === "error" — fall through to retry
        const freshEntryAfterUpload = this._files.get(id)!;
        attempt = freshEntryAfterUpload.retryAttempt + 1;
        this._patch(id, { retryAttempt: attempt });

        if (attempt > MAX_RETRIES) {
          logUploadFailure(
            entry.name,
            "MAX_RETRIES_EXCEEDED",
            "Upload failed after maximum retries.",
            attempt
          );
          console.log(`[UPLOAD_FAILED] id=${id} error=MAX_RETRIES_EXCEEDED`);
          this._patch(id, {
            state: "failed",
            error: "Retry failed — tap to retry",
          });
          this._activeFileIds.delete(id);
          this._runningProcesses.delete(id);
          return;
        }

        // ── Backoff ───────────────────────────────────────────────────────────────
        const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
        logRetryAttempt(entry.name, attempt, delay);
        console.log(`[UPLOAD_RETRY] id=${id} attempt=${attempt}`);

        this._patch(id, {
          state: "retrying",
          error: "Reconnecting…",
        });

        await this._sleep(delay, id);
        if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
          return;
        }
      }
    } catch (err) {
      console.error(`[QueueManager] Exception in _processFile for file ${id}:`, err);
      const entry = this._files.get(id);
      if (entry && entry.state !== "completed" && entry.state !== "cancelled") {
        const classified = classifyUploadError(err, "general");
        logUploadFailure(entry.name, classified.code, classified.userMessage, attempt);
        console.log(`[UPLOAD_FAILED] id=${id} error=${classified.userMessage}`);
        this._patch(id, {
          state: "failed",
          error: "Retry failed — tap to retry",
        });
      }
    } finally {
      this._runningProcesses.delete(id); // ALWAYS release the duplicate process lock unconditionally
      if (this._fileExecutionIds.get(id) === execId) {
        console.log(`[QueueManager:Debug] Releasing active slot in finally block for file ${id}`);
        this._activeFileIds.delete(id);
        this._abortControllers.delete(id);
        this._lastProgressAt.delete(id);
        this._fileExecutionIds.delete(id);
        this._releaseWakeLockIfDone();
        this._scheduleQueueDrain();
      }
    }
  }



  // ─── Presign ──────────────────────────────────────────────────────────────────

  private async _generateUploadUrlWithRetry(
    id: string
  ): Promise<{
    token: string;
    storagePath: string;
    alreadyExists: false;
  } | {
    alreadyExists: true;
    storagePath: string;
  } | null> {
    const entry = this._files.get(id);
    if (!entry || !entry.file) return null;

    const retries = 5;
    const timeoutMs = this._isMobile ? 60_000 : 15_000;
    let lastError: unknown = null;

    for (let i = 0; i < retries; i++) {
      if (this._destroyed || !this._files.has(id)) return null;

      // Offline detection
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        console.warn(`[QueueManager] Offline during URL generation for ${entry.name}. Waiting...`);
        await this._waitForNetwork(id);
      }

      const controller = new AbortController();
      this._abortControllers.set(id, controller);

      logPresignRequest(entry.name, entry.file.size);

      try {
        const result = await Promise.race([
          // The actual presign fetch
          this._fetchPresign(id, controller.signal),

          // Hard timeout
          new Promise<never>((_, reject) => {
            const t = setTimeout(
              () => reject(new StructuredUploadError("NETWORK_TIMEOUT", "Upload initialization timed out.")),
              timeoutMs
            );
            // Clean up timeout if aborted
            controller.signal.addEventListener("abort", () => clearTimeout(t));
          }),
        ]);

        logPresignResult(entry.name, true);
        return result;
      } catch (err) {
        lastError = err;
        if (controller.signal.aborted) {
          console.log(`[QueueManager] Presign fetch aborted for ${entry.name}`);
          return null; // Upload was cancelled
        }

        const snapshot = getDiagnosticsSnapshot({
          fileId: id,
          fileName: entry.file.name,
          fileSize: entry.file.size,
          mimeType: entry.file.type || "application/octet-stream",
          retryCount: i,
          supabaseResponseStatus: err instanceof Error ? err.message : String(err),
          verificationResult: "failed",
        });
        logUploadDiagnostics(snapshot, "FAILURE");

        // Transient network error check
        const isNetworkError =
          err instanceof TypeError ||
          (err instanceof Error && (
            err.message?.toLowerCase().includes("network") ||
            err.message?.toLowerCase().includes("fetch") ||
            err.message?.toLowerCase().includes("timeout") ||
            err.message?.toLowerCase().includes("aborted")
          ));

        if (!isNetworkError && i === 0) {
          // If it's a structural error (e.g. 400 Bad Request, unauthorized), fail immediately
          break;
        }

        if (i < retries - 1) {
          // Exponential backoff
          const delay = 1000 * Math.pow(2, i + 1) + Math.random() * 300;
          this._patch(id, {
            error: `Connection interrupted. Reconnecting upload… (Attempt ${i + 1}/5)`,
          });
          await new Promise((r) => setTimeout(r, delay));
        }
      } finally {
        this._abortControllers.delete(id);
      }
    }

    // All retries failed
    const classified = classifyUploadError(lastError, "presign");
    logPresignResult(entry.name, false, classified.userMessage);

    this._patch(id, {
      state: "failed",
      error: `Upload initialization failed: ${classified.userMessage}.`,
    });
    this._activeFileIds.delete(id);
    this._runningProcesses.delete(id);
    return null;
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

    // Point 4: Mobile Fetch Defense with AbortController and Timeout (60s on mobile, 15s on desktop)
    const timeoutVal = this._isMobile ? 60000 : 15000;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutVal);

    // Chain signals
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);

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
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
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
      const execId = this._fileExecutionIds.get(id);

      const wrappedResolve = (res: "success" | "cancelled" | "error") => {
        if (initTimeout) clearTimeout(initTimeout);
        this._activeResolvers.delete(id);
        resolve(res);
      };
      this._activeResolvers.set(id, wrappedResolve);

      const entry = this._files.get(id);
      if (!entry?.file) {
        wrappedResolve("cancelled");
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        toast.error(`Storage configuration error for "${entry.name}". Please contact support.`);
        this.removeFile(id);
        wrappedResolve("cancelled");
        return;
      }

      const uploadEndpoint = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;
      const safeMimeType = this._getSafeMimeType(entry.file);

      // Set watchdog baseline baseline immediately to prevent any startup race condition
      this._lastProgressAt.set(id, Date.now());

      let initialized = false;
      let initTimeout: ReturnType<typeof setTimeout> | null = null;

      const upload = new tus.Upload(entry.file, {
        endpoint: uploadEndpoint,
        retryDelays: [0, 1000, 3000], // automatic retry system delays for packet drop
        chunkSize: this._chunkSize,
        headers: {
          "x-signature": token,
          "x-upsert": "true",
        },
        metadata: {
          bucketName: "order-files",
          objectName: storagePath,
          contentType: safeMimeType,
          filename: encodeURIComponent(entry.file.name),
          filetype: safeMimeType,
        },
        storeFingerprintForResuming: true, // enable resuming support
        fingerprint: (_file, opts) =>
          Promise.resolve(
            `tus-${id}-${opts?.endpoint ?? ""}-${entry.file!.size}`
          ),
        onBeforeRequest: () => {
          initialized = true;
          if (initTimeout) clearTimeout(initTimeout);
          this._lastProgressAt.set(id, Date.now());
          if (!navigator.onLine) logNetworkPause(entry.name);
        },
        onProgress: (bytesSent: number, bytesTotal: number) => {
          initialized = true;
          if (initTimeout) clearTimeout(initTimeout);
          const pct = bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0;
          
          console.log("[UPLOAD_PROGRESS]", {
            fileId: id,
            fileName: entry.name,
            progress: pct,
            bytesSent,
            bytesTotal,
          });

          logUploadChunk(entry.name, pct, bytesSent, bytesTotal);
          this._lastProgressAt.set(id, Date.now());

          this._patch(id, {
            state: "uploading",
            progress: pct,
            uploadSpeed: undefined,
          });
        },
        onSuccess: () => {
          initialized = true;
          if (initTimeout) clearTimeout(initTimeout);
          const durationMs = Date.now() - startedAt;
          logUploadSuccess(entry.name, entry.file!.size, storagePath, durationMs);

          console.log("[UPLOAD_COMPLETE]", {
            fileId: id,
            fileName: entry.name,
            storagePath,
            size: entry.file!.size,
            durationMs,
          });

          this._tusInstances.delete(id);
          wrappedResolve("success");
        },
        onError: (err) => {
          initialized = true;
          if (initTimeout) clearTimeout(initTimeout);
          upload.abort(false).catch(() => {});
          this._tusInstances.delete(id);

          const classified = classifyUploadError(err, "tus");

          console.error("[SUPABASE_UPLOAD_ERROR]", {
            fileId: id,
            fileName: entry?.file?.name ?? "unknown",
            fileSize: entry?.file?.size ?? 0,
            status: "initializing",
            online: typeof navigator !== "undefined" ? navigator.onLine : true,
            connection: typeof navigator !== "undefined" ? (navigator as any).connection?.effectiveType : undefined,
            memory: typeof performance !== "undefined" && (performance as any).memory ? (performance as any).memory : undefined,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
            timestamp: Date.now(),
            error: err,
          });

          if (!classified.retryable) {
            logUploadFailure(entry?.name ?? "unknown", classified.code, classified.userMessage, 0);
            toast.error(`Non-retryable upload error for "${entry?.name ?? "unknown"}": ${classified.userMessage}. Please select the file again.`);
            this.removeFile(id);
            wrappedResolve("cancelled"); // Non-retryable — don't loop
            return;
          }

          wrappedResolve("error");
        },
        onShouldRetry: (err, retryAttempt, options) => {
          return retryAttempt < options.retryDelays!.length;
        },
      });

      this._tusInstances.set(id, upload);

      const startUpload = async () => {
        try {
          const previousUploads = await withTimeout(upload.findPreviousUploads(), 15000);
          
          // Check execution ID and file state AFTER the async findPreviousUploads call!
          if (this._fileExecutionIds.get(id) !== execId || this._destroyed || !this._files.has(id)) {
            upload.abort(true).catch(() => {});
            this._tusInstances.delete(id);
            wrappedResolve("cancelled");
            return;
          }

          const freshEntry = this._files.get(id)!;
          if (freshEntry.state === "paused" || freshEntry.state === "cancelled" || freshEntry.state === "failed") {
            upload.abort(true).catch(() => {});
            this._tusInstances.delete(id);
            wrappedResolve("cancelled");
            return;
          }

          if (previousUploads && previousUploads.length > 0) {
            console.log(`[QueueManager] Found previous upload for ${entry?.name}, resuming...`);
            upload.resumeFromPreviousUpload(previousUploads[0]);
          }

          // 15-second startup timeout
          initTimeout = setTimeout(() => {
            if (!initialized) {
              console.error(`[QueueManager] TUS upload startup timed out for ${entry.name}`);
              upload.abort(true).catch(() => {});
              this._tusInstances.delete(id);
              
              const err = new Error("INIT_TIMEOUT");
              console.error("[SUPABASE_UPLOAD_ERROR]", {
                fileId: id,
                fileName: entry.name,
                fileSize: entry.size,
                status: "initializing",
                online: typeof navigator !== "undefined" ? navigator.onLine : true,
                connection: typeof navigator !== "undefined" ? (navigator as any).connection?.effectiveType : undefined,
                memory: typeof performance !== "undefined" && (performance as any).memory ? (performance as any).memory : undefined,
                userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
                timestamp: Date.now(),
                error: err,
              });

              wrappedResolve("error");
            }
          }, 15000);

          upload.start();
        } catch (err) {
          console.error(`[QueueManager] Exception during TUS startup for "${entry.name}":`, err);
          upload.abort(true).catch(() => {});
          this._tusInstances.delete(id);
          wrappedResolve("error");
        }
      };

      startUpload();
    });
  }

  // ─── Watchdog ─────────────────────────────────────────────────────────────────

  private _runWatchdog(): void {
    if (this._destroyed) return;

    const now = Date.now();

    for (const [id, entry] of this._files) {
      // Stuck preparing / queued / requesting_url safety timeout (20s limit, Fix 10)
      if ((entry.state === "preparing" || entry.state === "queued" || entry.state === "requesting_url") && this._activeFileIds.has(id)) {
        const activeTime = this._lastProgressAt.get(id) ?? now;
        if (!this._lastProgressAt.has(id)) {
          this._lastProgressAt.set(id, now);
        }
        const elapsed = now - activeTime;
        const stuckLimit = 20_000;
        if (elapsed > stuckLimit) {
          console.warn(
            `[QueueManager:Watchdog] Stuck preparing/initializing state detected for "${entry.name}" after ${elapsed}ms. Retrying.`
          );

          // Invalidate current execution immediately
          const currentExecId = this._fileExecutionIds.get(id) ?? 0;
          this._fileExecutionIds.set(id, currentExecId + 1);

          this._abortFileUpload(id, "error");
          this._patch(id, {
            state: "preparing",
            error: "Initialization timed out — retrying…",
          });
          
          this._activeFileIds.delete(id);
          this._runningProcesses.delete(id);
          this._scheduleQueueDrain();
          continue;
        }
      }

      if (entry.state !== "uploading") continue;

      const lastProgress = this._lastProgressAt.get(id) ?? now;
      const elapsed = now - lastProgress;

      if (elapsed > 60_000) {
        console.warn(
          `[QueueManager:Watchdog] Upload hard timed out for "${entry.name}" after 60s of no progress. Aborting.`
        );
        toast.error(`Upload stalled for "${entry.name}" (timeout 60s). Please select the file again.`);
        this._abortFileUpload(id);
        this.removeFile(id);
      } else if (elapsed > WATCHDOG_STALL_MS) {
        console.warn(
          `[QueueManager:Watchdog] Upload stalled for "${entry.name}" — ${elapsed}ms since last progress. Aborting for retry.`
        );
        this._abortFileUpload(id, "error");
        this._patch(id, {
          state: "retrying",
          error: "Upload stalled — reconnecting…",
        });
        // The _processFile loop is awaiting _runTusUpload which will reject, triggering retry
      }
    }
  }

  // ─── Network events ───────────────────────────────────────────────────────────

  /** Pause all active/queued uploads. */
  pauseAll(): void {
    console.log("[QueueManager] pauseAll() called.");
    for (const [id, entry] of this._files) {
      if (
        entry.state === "uploading" ||
        entry.state === "requesting_url" ||
        entry.state === "preparing" ||
        entry.state === "retrying"
      ) {
        this._abortFileUpload(id);
        this._patch(id, {
          state: "paused",
          error: "Uploads paused.",
        });
        this._activeFileIds.delete(id);
      }
    }
    this._releaseWakeLockIfDone();
  }

  /** Resume all paused uploads. */
  resumeAll(): void {
    console.log("[QueueManager] resumeAll() called.");
    for (const [id, entry] of this._files) {
      if (entry.state === "paused") {
        this._patch(id, {
          state: "preparing",
          error: undefined,
        });
      }
    }
    this._scheduleQueueDrain();
  }

  private _handleOnline(): void {
    this._online = true;
    logNetworkResume("*");
    this._emit({ type: "ONLINE_CHANGED", online: true });

    // Reset watchdog baselines so we don't false-abort uploads that were paused
    const now = Date.now();
    for (const id of this._activeFileIds) {
      this._lastProgressAt.set(id, now);
    }

    this.resumeAll();
  }

  private _handleOffline(): void {
    this._online = false;
    logNetworkPause("*");
    this._emit({ type: "ONLINE_CHANGED", online: false });

    this.pauseAll();
  }

  private _handleVisibilityChange(): void {
    if (document.visibilityState === "hidden") {
      console.log("[QueueManager] App hidden (tab suspended) — pausing all active uploads.");
      this.pauseAll();
    } else if (document.visibilityState === "visible" && this._online) {
      console.log("[QueueManager] App visible — resuming all suspended uploads.");
      // Reset watchdog baselines — tab may have been hidden for >20s
      const now = Date.now();
      for (const id of this._activeFileIds) {
        this._lastProgressAt.set(id, now);
      }
      this.resumeAll();
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
  private _abortFileUpload(id: string, reason: "cancelled" | "error" = "cancelled"): void {
    const tusInstance = this._tusInstances.get(id);
    if (tusInstance) {
      tusInstance.abort(reason === "cancelled").catch(() => {});
      this._tusInstances.delete(id);
    }

    const retryTimeout = this._tusRetryTimeouts.get(id);
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      this._tusRetryTimeouts.delete(id);
    }

    const controller = this._abortControllers.get(id);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(id);
    }

    const resolver = this._activeResolvers.get(id);
    if (resolver) {
      resolver(reason);
      this._activeResolvers.delete(id);
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
   * Sleep for ms, but return early if the file is removed, paused, or cancelled.
   * Uses a simple Promise + setTimeout (no AbortController needed here).
   */
  private _sleep(ms: number, id?: string): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      if (id) {
        // If the file is removed, paused, or cancelled while sleeping, resolve immediately
        const check = setInterval(() => {
          const entry = this._files.get(id);
          if (
            !entry ||
            entry.state === "paused" ||
            entry.state === "completed" ||
            entry.state === "failed" ||
            entry.state === "cancelled"
          ) {
            clearTimeout(t);
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => clearInterval(check), ms + 100);
      }
    });
  }

  private async _runPostUploadProcessing(
    id: string
  ): Promise<void> {
    const entry = this._files.get(id);
    if (!entry) return;

    try {
      let fileToProcess = entry.file;
      if (!fileToProcess) {
        const dbFile = await indexedDbStore.getFile(id);
        if (dbFile) {
          fileToProcess = dbFile;
          this._patch(id, { file: dbFile });
        }
      }

      const isPdf =
        entry.name.toLowerCase().endsWith(".pdf") ||
        (fileToProcess && (fileToProcess.type === "application/pdf"));

      if (isPdf && entry.pages === null) {
        if (entry.size > 100 * 1024 * 1024) {
          console.warn(`[QueueManager] PDF file size ${entry.size} is too large (>100MB) for parsing. Defaulting to 1 page.`);
          this._patch(id, {
            state: "completed",
            pages: 1,
            pdfParseFailed: true,
          });
          return;
        }

        if (!fileToProcess) {
          console.warn(`[QueueManager] PDF file not found in memory or IndexedDB for processing: ${entry.name}. Defaulting to 1 page.`);
          this._patch(id, {
            state: "completed",
            pages: 1,
          });
          return;
        }

        const pagesPromise = this._parsePdfPages(fileToProcess);
        const timeoutPromise = new Promise<{ count: number; failed: boolean; timeout: boolean }>((resolve) =>
          setTimeout(() => resolve({ count: 1, failed: false, timeout: true }), 5000)
        );

        const result = await Promise.race([
          pagesPromise.then(res => ({ ...res, timeout: false })),
          timeoutPromise,
        ]);

        if (result.timeout) {
          console.warn(`[QueueManager] PDF parsing timed out (5s limit) for "${entry.name}". Defaulting to 1 page.`);
          this._patch(id, {
            state: "completed",
            pages: 1,
            error: undefined,
          });
        } else if (result.failed) {
          console.warn(`[QueueManager] PDF parsing failed for "${entry.name}". Defaulting to 1 page and manual entry.`);
          toast.warning(`Couldn't auto-detect page count for "${entry.name}". You can set pages manually.`);
          this._patch(id, {
            state: "completed",
            pages: 1,
            pdfParseFailed: true,
            error: undefined,
          });
        } else {
          console.log(`[QueueManager] PDF parsing successful for "${entry.name}": ${result.count} pages.`);
          this._patch(id, {
            state: "completed",
            pages: result.count,
            error: undefined,
          });
        }
      } else {
        this._patch(id, {
          state: "completed",
        });
      }
    } catch (err) {
      console.error(`[QueueManager] Error during post-upload processing for "${entry.name}":`, err);
      this._patch(id, {
        state: "completed",
        pages: entry.pages ?? 1,
      });
    }
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
      idle: "idle",
      preparing: "preparing",
      queued: "queued",
      requesting_url: "preparing",
      uploading: "uploading",
      verifying: "verifying",
      retrying: "retrying",
      paused: "paused",
      completed: "completed",
      failed: "failed",
      cancelled: "cancelled",
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
      uploadedUrl: entry.storagePath,
      error: entry.error,
      copies: entry.copies,
      color: entry.color,
      doubleSided: entry.doubleSided,
      mimeType: entry.mimeType,
      retryAttempt: entry.retryAttempt,
      retryCount: entry.retryAttempt,
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

  private _getSafeMimeType(file: File): string {
    const nameLower = file.name.toLowerCase();
    if (nameLower.endsWith(".pdf")) {
      return "application/pdf";
    }
    if (nameLower.endsWith(".png")) {
      return "image/png";
    }
    if (nameLower.endsWith(".jpg") || nameLower.endsWith(".jpeg")) {
      return "image/jpeg";
    }
    if (nameLower.endsWith(".webp")) {
      return "image/webp";
    }
    return file.type || "application/octet-stream";
  }

  private async _validateAndHydrateFile(file: File): Promise<File> {
    if (!file || !(file instanceof File)) {
      throw new StructuredUploadError("ANDROID_FILE_HYDRATION_FAILED", "Invalid file object.");
    }

    // Android Chrome hydration delay fix
    if (this._isMobile) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const safeMimeType = this._getSafeMimeType(file);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const rebuiltFile = new File(
      [file],
      file.name || `upload-${Date.now()}.${ext || "jpg"}`,
      {
        type: safeMimeType,
        lastModified: file.lastModified || Date.now(),
      }
    );

    if (rebuiltFile.size <= 0) {
      throw new StructuredUploadError("ANDROID_FILE_HYDRATION_FAILED", `Empty file detected: ${rebuiltFile.name}`);
    }

    return rebuiltFile;
  }

  getListenerCount(): number {
    return this._listeners.size;
  }
}
