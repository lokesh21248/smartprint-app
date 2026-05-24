"use client";

/**
 * useUploadQueue.ts
 *
 * Thin React adapter for UploadQueueManager.
 *
 * Responsibilities:
 *  - Creates one UploadQueueManager instance per mount (stable via useRef)
 *  - Subscribes to manager events and reflects them into React state
 *  - Provides stable callback refs (no stale closures in async callbacks)
 *  - Rehydrates session from localStorage + IndexedDB on mount
 *  - Destroys manager on unmount (clean listener + timer removal)
 *  - Exposes imperative ref handle for `uploadAll` + `retryFailed` + `clearSession`
 *
 * @module hooks/useUploadQueue
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  UploadQueueManager,
  type QueueEvent,
} from "@/lib/upload/UploadQueueManager";
import type { UploadedFile } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseUploadQueueOptions {
  shopId: string;
  orderId: string;
  disabled?: boolean;
}

export interface UseUploadQueueReturn {
  files: UploadedFile[];
  isOnline: boolean;
  addFiles: (rawFiles: File[]) => void;
  removeFile: (id: string) => void;
  cancelUpload: (id: string) => void;
  retryFile: (id: string) => void;
  retryAll: () => void;
  updateConfig: (
    id: string,
    updates: Partial<Pick<UploadedFile, "copies" | "color" | "doubleSided" | "pages">>
  ) => void;
  reorder: (newOrder: UploadedFile[]) => void;
  uploadAll: () => Promise<{
    success: boolean;
    files: UploadedFile[];
    failedCount: number;
  }>;
  clearSession: () => void;
  cancelAll: () => void;
  clear: () => void;
  managerRef: React.MutableRefObject<UploadQueueManager | null>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUploadQueue({
  shopId,
  orderId,
  disabled = false,
}: UseUploadQueueOptions): UseUploadQueueReturn {
  // ── Local state: only the UploadedFile[] array — all logic in manager ────────
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // ── Manager instance — one per mount, never recreated ─────────────────────
  const managerRef = useRef<UploadQueueManager | null>(null);

  // ── Mount effect — create manager, rehydrate, subscribe ────────────────────
  const rehydratedRef = useRef(false);

  useEffect(() => {
    if (disabled) return;

    // Create manager
    const manager = new UploadQueueManager({ shopId, orderId });
    managerRef.current = manager;

    // Subscribe to all queue events → update React state
    const unsub = manager.subscribe((event: QueueEvent) => {
      switch (event.type) {
        case "FILE_ADDED":
          setFiles((prev) => {
            // Avoid duplicates during rehydration
            if (prev.some((f) => f.id === event.file.id)) return prev;
            return [...prev, event.file];
          });
          break;

        case "FILE_UPDATED":
          setFiles((prev) =>
            prev.map((f) => (f.id === event.file.id ? event.file : f))
          );
          break;

        case "FILE_REMOVED":
          setFiles((prev) => prev.filter((f) => f.id !== event.id));
          break;

        case "ONLINE_CHANGED":
          setIsOnline(event.online);
          break;

        case "SESSION_CLEARED":
          setFiles([]);
          break;
      }
    });

    // Rehydration disabled to guarantee the uploader always starts with a clean, empty state on refresh or failed uploads
    if (!rehydratedRef.current) {
      rehydratedRef.current = true;
    }

    return () => {
      unsub();
      manager.destroy();
      managerRef.current = null;
    };
    // shopId + orderId are stable for the lifetime of the upload session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, orderId, disabled]);

  // ─── Stable callbacks ─────────────────────────────────────────────────────

  const addFiles = useCallback(
    (rawFiles: File[]) => {
      if (disabled) return;
      managerRef.current?.addFiles(rawFiles);
    },
    [disabled]
  );

  const removeFile = useCallback(
    (id: string) => {
      if (disabled) return;
      managerRef.current?.removeFile(id);
    },
    [disabled]
  );

  const cancelUpload = useCallback(
    (id: string) => {
      managerRef.current?.cancelUpload(id);
    },
    []
  );

  const retryFile = useCallback((id: string) => {
    managerRef.current?.retryFile(id);
  }, []);

  const retryAll = useCallback(() => {
    managerRef.current?.retryAll();
  }, []);

  const updateConfig = useCallback(
    (
      id: string,
      updates: Partial<Pick<UploadedFile, "copies" | "color" | "doubleSided" | "pages">>
    ) => {
      managerRef.current?.updateConfig(id, updates);
    },
    []
  );

  const reorder = useCallback((newOrder: UploadedFile[]) => {
    managerRef.current?.reorder(newOrder.map((f) => f.id));
    // Immediately reflect in local state for smooth drag UX
    setFiles(newOrder);
  }, []);

  const uploadAll = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) {
      return { success: false, files: [], failedCount: 0 };
    }

    // Queue all failed files for retry
    manager.retryAll();

    // Wait for all to settle
    return manager.waitForAllSettled();
  }, []);

  const clearSession = useCallback(() => {
    managerRef.current?.clearSession();
  }, []);

  const cancelAll = useCallback(() => {
    managerRef.current?.cancelAll();
  }, []);

  const clear = useCallback(() => {
    managerRef.current?.clear();
  }, []);

  return {
    files,
    isOnline,
    addFiles,
    removeFile,
    cancelUpload,
    retryFile,
    retryAll,
    updateConfig,
    reorder,
    uploadAll,
    clearSession,
    cancelAll,
    clear,
    managerRef,
  };
}

// ─── Imperative ref handle (for parent components using forwardRef) ────────────

export interface UploadQueueHandle {
  uploadAll: () => Promise<{
    success: boolean;
    files: UploadedFile[];
    failedCount: number;
  }>;
  retryFailed: () => void;
  clearSession: () => void;
}

/**
 * Higher-order helper: wraps a component that uses useUploadQueue and exposes
 * an imperative handle via forwardRef.
 *
 * Usage:
 *   const uploaderRef = useRef<UploadQueueHandle>(null);
 *   const result = await uploaderRef.current.uploadAll();
 */
export function createUploadQueueHandle(
  managerRef: React.MutableRefObject<UploadQueueManager | null>
) {
  return {
    async uploadAll() {
      const manager = managerRef.current;
      if (!manager) return { success: false, files: [], failedCount: 0 };
      manager.retryAll();
      return manager.waitForAllSettled();
    },
    retryFailed() {
      managerRef.current?.retryAll();
    },
    clearSession() {
      managerRef.current?.clearSession();
    },
    cancelAll() {
      managerRef.current?.cancelAll();
    },
    clear() {
      managerRef.current?.clear();
    },
  };
}
