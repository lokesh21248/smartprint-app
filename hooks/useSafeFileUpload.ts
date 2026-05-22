"use client";

/**
 * useSafeFileUpload — production-grade upload hook for SmartPrint.
 *
 * Architecture:
 *   File → POST /api/storage/presign → signedUrl + storagePath
 *        → XHR PUT to Supabase (with real progress events)
 *        → returns storagePath for POST /api/orders
 *
 * This hook is a PURE UI-layer enhancement.
 * It does NOT change the upload flow, storage architecture,
 * Supabase bucket config, or any API.
 *
 * Key design decisions:
 * - XHR (not fetch) for the storage PUT: fetch doesn't expose upload progress
 * - AbortController / XHR.abort() for clean unmount cancellation
 * - No global state — local hook state only
 * - Memoized callbacks to prevent unnecessary re-renders
 *
 * @module hooks/useSafeFileUpload
 */

import { useState, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UploadStatus =
  | "idle"
  | "presigning"
  | "uploading"
  | "success"
  | "error";

export interface UploadResult {
  storagePath: string;
  sanitizedName: string;
  expiresIn: number;
}

export interface UseSafeFileUploadReturn {
  /** Start the upload. Returns the storagePath on success, null on failure. */
  upload: (file: File, shopId: string) => Promise<UploadResult | null>;
  /** 0–100. Only updates during the PUT phase. */
  progress: number;
  /** Current lifecycle status. */
  status: UploadStatus;
  /** Human-readable error if status === 'error'. */
  error: string | null;
  /** Abort any in-flight upload and reset to idle. */
  abort: () => void;
  /** Reset all state to idle without aborting. */
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSafeFileUpload(): UseSafeFileUploadReturn {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // XHR ref for abort
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  // Fetch AbortController ref for presign abort
  const presignAbortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setError(null);
  }, []);

  const abort = useCallback(() => {
    presignAbortRef.current?.abort();
    xhrRef.current?.abort();
    reset();
  }, [reset]);

  const upload = useCallback(
    async (file: File, shopId: string): Promise<UploadResult | null> => {
      // Clean slate
      setStatus("presigning");
      setProgress(0);
      setError(null);

      // ── Step 1: Get presigned upload URL ─────────────────────────────────
      const presignController = new AbortController();
      presignAbortRef.current = presignController;

      let signedUrl: string;
      let storagePath: string;
      let sanitizedName: string;
      let expiresIn: number;

      try {
        const presignRes = await fetch("/api/storage/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          }),
          signal: presignController.signal,
        });

        if (!presignRes.ok) {
          const body = await presignRes.json().catch(() => ({}));
          const msg =
            body.error ||
            `Upload preparation failed (${presignRes.status})`;
          setStatus("error");
          setError(msg);
          return null;
        }

        const presignData = await presignRes.json();
        signedUrl = presignData.signedUrl;
        storagePath = presignData.storagePath;
        sanitizedName = presignData.sanitizedName ?? file.name;
        expiresIn = presignData.expiresIn ?? 120;
      } catch (err) {
        if ((err as Error).name === "AbortError") return null; // user cancelled
        const msg =
          err instanceof Error ? err.message : "Network error during presign";
        setStatus("error");
        setError(msg);
        return null;
      }

      // ── Step 2: PUT file directly to Supabase via signed URL ──────────────
      setStatus("uploading");
      setProgress(0);

      return new Promise<UploadResult | null>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setProgress(pct);
          }
        });

        xhr.addEventListener("load", () => {
          xhrRef.current = null;
          if (xhr.status >= 200 && xhr.status < 300) {
            setStatus("success");
            setProgress(100);
            resolve({ storagePath, sanitizedName, expiresIn });
          } else {
            const msg = `Storage upload failed (HTTP ${xhr.status})`;
            setStatus("error");
            setError(msg);
            resolve(null);
          }
        });

        xhr.addEventListener("error", () => {
          xhrRef.current = null;
          setStatus("error");
          setError("Network error during file upload. Please retry.");
          resolve(null);
        });

        xhr.addEventListener("abort", () => {
          xhrRef.current = null;
          // Reset to idle so user can retry
          reset();
          resolve(null);
        });

        xhr.open("PUT", signedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });
    },
    [reset]
  );

  return { upload, progress, status, error, abort, reset };
}
