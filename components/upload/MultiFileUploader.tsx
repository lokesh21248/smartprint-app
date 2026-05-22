"use client";

import dynamic from "next/dynamic";
import {
  useState,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef,
} from "react";
import { Reorder, useDragControls, motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Trash2,
  GripVertical,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  Image as ImageIcon,
  WifiOff,
  X,
  Upload,
  Zap,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import pLimit from "p-limit";
import * as tus from "tus-js-client";
import { indexedDbStore } from "@/lib/upload/indexedDb";
import type { UploadedFile } from "@/types";
import { classifyUploadError } from "@/lib/upload/errorClassifier";
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

// Dynamic import for SSR safety
const MultiFileDropzone = dynamic(
  () => import("./MultiFileDropzone").then((m) => m.MultiFileDropzone),
  {
    ssr: false,
    loading: () => (
      <div className="h-44 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    ),
  }
);

export interface MultiFileUploaderRef {
  uploadAll: () => Promise<{ success: boolean; files: UploadedFile[]; failedCount: number }>;
  retryFailed: () => Promise<void>;
  clearSession: () => void;
}

interface MultiFileUploaderProps {
  files: UploadedFile[];
  onChange: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  shopId: string;
  orderId: string;
  disabled?: boolean;
}

// Track active TUS uploads so we can abort them on cancel
const activeTusUploads = new Map<string, tus.Upload>();

export const MultiFileUploader = forwardRef<MultiFileUploaderRef, MultiFileUploaderProps>(
  ({ files, onChange, shopId, orderId, disabled }, ref) => {
    const isUploadingRef = useRef(false);
    const manuallyCancelledRef = useRef<Set<string>>(new Set());
    const [isOnline, setIsOnline] = useState(
      typeof navigator !== "undefined" ? navigator.onLine : true
    );
    // Keep a stable ref to the latest uploadSingleFile — avoids stale closures in callbacks
    const uploadSingleFileRef = useRef<(fileItem: UploadedFile) => Promise<UploadedFile>>(
      null as unknown as (fileItem: UploadedFile) => Promise<UploadedFile>
    );
    const activeUploadPromisesRef = useRef<Map<string, Promise<UploadedFile>>>(new Map());
    const filesRef = useRef(files);
    const lastProgressTimesRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
      filesRef.current = files;
    }, [files]);

    // ── Local Storage metadata sync ──────────────────────────────────────────
    useEffect(() => {
      const metadata = files.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        pages: f.pages,
        pdfParseFailed: f.pdfParseFailed,
        progress: f.progress,
        status: f.status,
        storagePath: f.storagePath,
        error: f.error,
        copies: f.copies,
        color: f.color,
        doubleSided: f.doubleSided,
        mimeType: f.mimeType,
        retryAttempt: f.retryAttempt,
      }));
      localStorage.setItem("smartprint_upload_metadata", JSON.stringify(metadata));
    }, [files]);

    // ── Mount Rehydration ───────────────────────────────────────────────────
    const rehydratedRef = useRef(false);
    useEffect(() => {
      if (rehydratedRef.current) return;
      rehydratedRef.current = true;

      const rehydrate = async () => {
        const saved = localStorage.getItem("smartprint_upload_metadata");
        if (!saved) return;

        try {
          const parsed = JSON.parse(saved) as Partial<UploadedFile>[];
          if (!parsed.length) return;

          const rehydratedList: UploadedFile[] = [];

          for (const item of parsed) {
            if (!item.id || !item.name) continue;

            const binaryFile = await indexedDbStore.getFile(item.id);

            const rehydratedItem: UploadedFile = {
              id: item.id,
              name: item.name,
              size: item.size || 0,
              pages: item.pages !== undefined ? item.pages : null,
              pdfParseFailed: item.pdfParseFailed || false,
              progress: item.progress || 0,
              status: item.status || "queued",
              storagePath: item.storagePath,
              error: item.error,
              copies: item.copies || 1,
              color: item.color || false,
              doubleSided: item.doubleSided || false,
              mimeType: item.mimeType || binaryFile?.type || "application/octet-stream",
              retryAttempt: item.retryAttempt,
            };

            if (binaryFile) {
              rehydratedItem.file = binaryFile;
              // Reset active/compressing states back to queued so they resume automatically
              if (rehydratedItem.status === "uploading" || rehydratedItem.status === "compressing") {
                rehydratedItem.status = "queued";
                rehydratedItem.progress = 0;
              }
            } else {
              // Binary is missing
              if (rehydratedItem.status !== "uploaded") {
                rehydratedItem.status = "failed";
                rehydratedItem.error = "Device revoked file permission. Please remove and re-add this file.";
              }
            }

            rehydratedList.push(rehydratedItem);
          }

          if (rehydratedList.length > 0) {
            onChange(rehydratedList);
          }
        } catch (err) {
          console.warn("[MultiFileUploader] Rehydration failed:", err);
        }
      };

      rehydrate();
    }, [onChange]);

    // ── Online/Offline detection with actual auto-resume ──────────────────────
    useEffect(() => {
      const handleOnline = () => {
        setIsOnline(true);
        toast.success("Back online!");
      };

      const handleOffline = () => {
        setIsOnline(false);
        // Abort active uploads so they fail fast and enter the waiting loop immediately
        filesRef.current.forEach((f) => {
          if (f.status === "uploading" || f.status === "compressing" || f.status === "retrying") {
            const activeUpload = activeTusUploads.get(f.id);
            if (activeUpload) {
              activeUpload.abort(true);
              activeTusUploads.delete(f.id);
            }
          }
        });
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }, []);

    // ── Watchdog Timer & Visibility Auto-recovery ───────────────────────────
    useEffect(() => {
      const checkWatchdog = () => {
        const now = Date.now();
        const uploadingFiles = filesRef.current.filter(
          (f) => f.status === "uploading" || f.status === "compressing" || f.status === "retrying"
        );

        uploadingFiles.forEach((f) => {
          const lastProgress = lastProgressTimesRef.current.get(f.id) || now;
          if (now - lastProgress > 8000) {
            console.warn(`[Watchdog] Active upload hung for ${f.name}. Inactive for ${now - lastProgress}ms. Aborting for inline retry.`);
            
            const activeUpload = activeTusUploads.get(f.id);
            if (activeUpload) {
              activeUpload.abort(true);
              activeTusUploads.delete(f.id);
            }
          }
        });
      };

      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          const now = Date.now();
          filesRef.current.forEach((f) => {
            if (f.status === "uploading" || f.status === "compressing" || f.status === "retrying") {
              const lastProgress = lastProgressTimesRef.current.get(f.id) || now;
              if (now - lastProgress > 8000) {
                checkWatchdog();
              }
              lastProgressTimesRef.current.set(f.id, now);
            }
          });
        }
      };

      const intervalId = setInterval(checkWatchdog, 3000);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => {
        clearInterval(intervalId);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }, []);

    // ── Beforeunload guard during active uploads ──────────────────────────────
    useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (isUploadingRef.current) {
          e.preventDefault();
          e.returnValue = "Files are still uploading. Are you sure you want to leave?";
        }
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    // ── PDF Page Count Parser ─────────────────────────────────────────────────
    const parsePdfPages = useCallback(async (file: File): Promise<{ count: number; failed: boolean }> => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const { PDFDocument } = await import("pdf-lib");
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        return { count: pdfDoc.getPageCount(), failed: false };
      } catch (err) {
        console.warn("[MultiFileUploader] PDF page count parse failed:", err);
        return { count: 1, failed: true };
      }
    }, []);

    // ── File Selection Handler ────────────────────────────────────────────────
    const handleFilesSelected = useCallback(
      async (newFiles: File[]) => {
        if (disabled) return;

        const filesToAdd: UploadedFile[] = [];
        let filesAdded = 0;
        let currentCount = filesRef.current.length;

        for (const file of newFiles) {
          if (currentCount >= 20) {
            toast.error("Maximum 20 files allowed per order.");
            break;
          }

          // File type check
          const type = file.type.toLowerCase();
          const ext = file.name.split(".").pop()?.toLowerCase();
          const isAllowedType =
            type === "application/pdf" ||
            type === "image/png" ||
            type === "image/jpeg" ||
            type === "image/jpg" ||
            type === "image/webp" ||
            ext === "pdf" ||
            ext === "png" ||
            ext === "jpg" ||
            ext === "jpeg" ||
            ext === "webp";

          if (!isAllowedType) {
            toast.error(
              `"${file.name}" is not supported. Only PDF, PNG, and JPG files are accepted.`
            );
            continue;
          }

          // Size check (25MB limit)
          if (file.size > 25 * 1024 * 1024) {
            toast.error(`"${file.name}" exceeds the 25 MB size limit.`);
            continue;
          }

          // Empty file check
          if (file.size === 0) {
            toast.error(`"${file.name}" is empty and cannot be uploaded.`);
            continue;
          }

          // Malicious filename check
          if (
            file.name.includes("..") ||
            file.name.includes("/") ||
            file.name.includes("\\") ||
            file.name.includes("\0")
          ) {
            toast.error(`"${file.name}" has an invalid filename.`);
            continue;
          }

          // Duplicate check (filename + size)
          const isDuplicate = filesRef.current.some(
            (f) => f.name === file.name && f.size === file.size
          ) || filesToAdd.some(
            (f) => f.name === file.name && f.size === file.size
          );
          if (isDuplicate) {
            toast.warning(`"${file.name}" is already in your list.`);
            continue;
          }

          const fileId = "file-" + Math.random().toString(36).slice(2, 11) + "-" + Date.now();
          const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");

          const newUploadedFile: UploadedFile = {
            id: fileId,
            file,
            name: file.name,
            size: file.size,
            pages: isPdf ? null : 1,
            pdfParseFailed: false,
            progress: 0,
            status: "queued",
            copies: 1,
            color: false,
            doubleSided: isPdf,
            mimeType: file.type || "application/octet-stream",
          };

          filesToAdd.push(newUploadedFile);
          filesAdded++;
          currentCount++;

          // Save binary to IndexedDB
          indexedDbStore.saveFile(fileId, file);

          // Parse PDF pages in background
          if (isPdf) {
            parsePdfPages(file).then(({ count, failed }) => {
              onChange((prev) =>
                prev.map((f) =>
                  f.id === fileId ? { ...f, pages: count, pdfParseFailed: failed } : f
                )
              );
              if (failed) {
                toast.warning(`Couldn't detect pages in "${file.name}". Set count manually.`);
              }
            });
          }
        }

        if (filesAdded > 0) {
          onChange((prev) => [...prev, ...filesToAdd]);
        }
      },
      [disabled, onChange, parsePdfPages]
    );

    // ── Remove File Handler ───────────────────────────────────────────────────
    const handleRemoveFile = useCallback(
      (id: string) => {
        if (disabled) return;
        manuallyCancelledRef.current.add(id);
        // Cancel any active TUS upload
        const activeUpload = activeTusUploads.get(id);
        if (activeUpload) {
          activeUpload.abort(true);
          activeTusUploads.delete(id);
          const fileItem = filesRef.current.find((f) => f.id === id);
          if (fileItem) logUploadCancelled(fileItem.name);
        }
        activeUploadPromisesRef.current.delete(id);
        indexedDbStore.deleteFile(id);
        onChange((prev) => prev.filter((f) => f.id !== id));
      },
      [onChange, disabled]
    );

    // ── Cancel Active Upload ──────────────────────────────────────────────────
    const handleCancelUpload = useCallback(
      (id: string) => {
        manuallyCancelledRef.current.add(id);
        const activeUpload = activeTusUploads.get(id);
        if (activeUpload) {
          activeUpload.abort(true);
          activeTusUploads.delete(id);
          const fileItem = filesRef.current.find((f) => f.id === id);
          if (fileItem) logUploadCancelled(fileItem.name);
        }
        activeUploadPromisesRef.current.delete(id);
        onChange((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, status: "failed" as const, progress: 0, error: "Upload cancelled." }
              : f
          )
        );
      },
      [onChange]
    );

    // ── Update Print Config ───────────────────────────────────────────────────
    const handleUpdateConfig = useCallback(
      (
        id: string,
        updates: Partial<Pick<UploadedFile, "copies" | "color" | "doubleSided" | "pages">>
      ) => {
        onChange((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
      },
      [onChange]
    );

    // ── Core Single-File Upload ───────────────────────────────────────────────
    const uploadSingleFile = useCallback(
      async (fileItem: UploadedFile): Promise<UploadedFile> => {
        // Idempotency: check if already in active upload promises
        const existingPromise = activeUploadPromisesRef.current.get(fileItem.id);
        if (existingPromise) {
          return existingPromise;
        }

        if (fileItem.status === "uploaded" && fileItem.storagePath) {
          return fileItem;
        }

        const uploadPromise = (async () => {
          const startedAt = Date.now();
          // Track bytes + timestamps for speed calculation
          let lastBytesSent = 0;
          let lastTimestamp = Date.now();
          let speedBytesPerSec = 0;

          // ── Functional state updater (never stale) ────────────────────────────
          const updateState = (
            status: UploadedFile["status"],
            progress: number,
            extra: Partial<UploadedFile> = {}
          ) => {
            filesRef.current = filesRef.current.map((f) =>
              f.id === fileItem.id ? { ...f, status, progress, ...extra } : f
            );
            onChange((prev) =>
              prev.map((f) =>
                f.id === fileItem.id ? { ...f, status, progress, ...extra } : f
              )
            );
          };

          try {
            let fileToUpload = fileItem.file;

            // Rehydrate file binary from IndexedDB if lost
            if (!fileToUpload) {
              const dbFile = await indexedDbStore.getFile(fileItem.id);
              if (dbFile) {
                fileToUpload = dbFile;
                // Cache back in memory
                filesRef.current = filesRef.current.map((f) =>
                  f.id === fileItem.id ? { ...f, file: dbFile } : f
                );
                onChange((prev) =>
                  prev.map((f) =>
                    f.id === fileItem.id ? { ...f, file: dbFile } : f
                  )
                );
              }
            }

            if (!fileToUpload) {
              const accessErr = new Error("FILE_ACCESS_REVOKED");
              const classified = classifyUploadError(accessErr, "general");
              updateState("failed", 0, { error: classified.userMessage });
              throw accessErr;
            }

            // ── 1. Image Compression ──────────────────────────────────────────
            if (fileToUpload.type.startsWith("image/")) {
              updateState("compressing", 0);
              try {
                const { compressImageIfNeeded } = await import("@/lib/upload/compressImage");
                const compResult = await compressImageIfNeeded(fileToUpload, 500 * 1024);
                logCompressionResult(
                  fileItem.name,
                  compResult.originalSizeBytes,
                  compResult.finalSizeBytes,
                  compResult.compressed
                );
                if (compResult.compressed) {
                  fileToUpload = compResult.file;
                  // Save compressed file to IndexedDB and update state sizes
                  await indexedDbStore.saveFile(fileItem.id, compResult.file);
                  const compressedFile = compResult.file;
                  filesRef.current = filesRef.current.map((f) =>
                    f.id === fileItem.id ? { ...f, file: compressedFile, size: compressedFile.size } : f
                  );
                  onChange((prev) =>
                    prev.map((f) =>
                      f.id === fileItem.id ? { ...f, file: compressedFile, size: compressedFile.size } : f
                    )
                  );
                }
              } catch (compressErr) {
                console.warn("[MultiFileUploader] Compression failed, uploading original:", compressErr);
              }
            }

            const finalFile: File = fileToUpload;

            // Define token tracking variables
            let token = "";
            let storagePath = "";
            let tokenFetchedAt = 0;
            const tokenTTL = 240 * 1000; // 4 minutes proactive refresh

            const fetchTokenIfNeeded = async () => {
              const now = Date.now();
              if (token && (now - tokenFetchedAt < tokenTTL)) {
                return { alreadyExists: false, storagePath };
              }

              updateState("retrying", filesRef.current.find(f => f.id === fileItem.id)?.progress || 0, {
                error: "Refreshing secure upload session..."
              });
              logPresignRequest(fileItem.name, finalFile.size);

              const presignRes = await fetch("/api/storage/presign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  shopId,
                  fileName: finalFile.name,
                  fileSize: finalFile.size,
                  mimeType: finalFile.type,
                  orderId,
                }),
              });

              if (!presignRes.ok) {
                const errBody = (await presignRes.json().catch(() => ({}))) as { error?: string };
                const presignError = new Error(errBody.error || `Server error (${presignRes.status})`);
                logPresignResult(fileItem.name, false, presignError.message);
                throw presignError;
              }

              const resData = (await presignRes.json()) as {
                token?: string;
                storagePath: string;
                alreadyExists?: boolean;
              };
              logPresignResult(fileItem.name, true);

              if (resData.alreadyExists) {
                return { alreadyExists: true, storagePath: resData.storagePath };
              }

              if (!resData.token) {
                throw new Error("Presign response missing token");
              }

              token = resData.token;
              storagePath = resData.storagePath;
              tokenFetchedAt = Date.now();
              return { alreadyExists: false, storagePath };
            };

            // Loop parameters for retrying
            let attempt = 0;
            const maxAttempts = 10;
            let success = false;
            let finalResult: UploadedFile | null = null;

            while (attempt < maxAttempts && !success) {
              // Check network connection first
              while (!navigator.onLine) {
                updateState("retrying", filesRef.current.find(f => f.id === fileItem.id)?.progress || 0, {
                  error: "Waiting for network..."
                });
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }

              try {
                // Get or refresh token
                const tokenResult = await fetchTokenIfNeeded();
                if (tokenResult && tokenResult.alreadyExists) {
                  const durationMs = Date.now() - startedAt;
                  logUploadSuccess(fileItem.name, finalFile.size, tokenResult.storagePath, durationMs);
                  const result: UploadedFile = {
                    ...fileItem,
                    status: "uploaded",
                    progress: 100,
                    storagePath: tokenResult.storagePath,
                    error: undefined,
                    uploadSpeed: undefined,
                    etaSeconds: undefined,
                  };
                  filesRef.current = filesRef.current.map((f) => (f.id === fileItem.id ? result : f));
                  onChange((prev) =>
                    prev.map((f) => (f.id === fileItem.id ? result : f))
                  );
                  success = true;
                  finalResult = result;
                  break;
                }

                // If not alreadyExists, do standard upload
                updateState("uploading", filesRef.current.find(f => f.id === fileItem.id)?.progress || 0);

                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                if (!supabaseUrl) {
                  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
                }
                const endpoint = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;

                logUploadStart(fileItem.name, finalFile.size);

                // Run the actual TUS upload in a Promise
                const result = await new Promise<UploadedFile>((resolvePromise, rejectPromise) => {
                  let isFirstProgress = true;
                  const upload = new tus.Upload(finalFile, {
                    endpoint,
                    retryDelays: [], // managing retries manually in while loop
                    headers: {
                      "x-signature": token,
                      "x-upsert": "true",
                    },
                    metadata: {
                      bucketName: "order-files",
                      objectName: storagePath,
                      contentType: finalFile.type || "application/octet-stream",
                    },
                    chunkSize: 5 * 1024 * 1024,
                    onBeforeRequest: (req) => {
                      if (!navigator.onLine) {
                        logNetworkPause(fileItem.name);
                      }
                      lastProgressTimesRef.current.set(fileItem.id, Date.now());
                    },
                    onError: (error) => {
                      activeTusUploads.delete(fileItem.id);
                      rejectPromise(error);
                    },
                    onProgress: (bytesSent, bytesTotal) => {
                      const pct = bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0;
                      logUploadChunk(fileItem.name, pct, bytesSent, bytesTotal);

                      // Refresh watchdog progress timer
                      lastProgressTimesRef.current.set(fileItem.id, Date.now());

                      // Calculate upload speed
                      const now = Date.now();
                      const elapsed = (now - lastTimestamp) / 1000;
                      if (elapsed > 0.5) {
                        const bytesDelta = bytesSent - lastBytesSent;
                        speedBytesPerSec = Math.round(bytesDelta / elapsed);
                        lastBytesSent = bytesSent;
                        lastTimestamp = now;
                      }

                      // Calculate ETA
                      const remainingBytes = bytesTotal - bytesSent;
                      const etaSecs =
                        speedBytesPerSec > 0 ? Math.ceil(remainingBytes / speedBytesPerSec) : null;

                      let errorMsg: string | undefined = undefined;
                      if (isFirstProgress) {
                        isFirstProgress = false;
                        if (pct > 0) {
                          errorMsg = "Upload resumed successfully";
                          setTimeout(() => {
                            const cur = filesRef.current.find(f => f.id === fileItem.id);
                            if (cur && cur.status === "uploading" && cur.error === "Upload resumed successfully") {
                              updateState("uploading", cur.progress, { error: undefined });
                            }
                          }, 2000);
                        }
                      }

                      updateState("uploading", pct, {
                        uploadSpeed: speedBytesPerSec,
                        etaSeconds: etaSecs ?? undefined,
                        error: errorMsg,
                      });

                      // Proactive token refresh check during active progress:
                      const tokenAge = Date.now() - tokenFetchedAt;
                      if (tokenAge > 200 * 1000) {
                        fetchTokenIfNeeded().then((refreshed) => {
                          if (refreshed && !refreshed.alreadyExists) {
                            if (!upload.options.headers) {
                              upload.options.headers = {};
                            }
                            upload.options.headers["x-signature"] = token;
                            console.log(`[TUS] Proactively refreshed token mid-upload for ${fileItem.name}`);
                          }
                        }).catch((err) => {
                          console.warn(`[TUS] Proactive token refresh failed:`, err);
                        });
                      }
                    },
                    onSuccess: () => {
                      const durationMs = Date.now() - startedAt;
                      logUploadSuccess(fileItem.name, finalFile.size, storagePath, durationMs);
                      activeTusUploads.delete(fileItem.id);

                      const resVal: UploadedFile = {
                        ...fileItem,
                        status: "uploaded",
                        progress: 100,
                        storagePath,
                        error: undefined,
                        uploadSpeed: undefined,
                        etaSeconds: undefined,
                      };
                      filesRef.current = filesRef.current.map((f) => (f.id === fileItem.id ? resVal : f));
                      onChange((prev) =>
                        prev.map((f) => (f.id === fileItem.id ? resVal : f))
                      );
                      resolvePromise(resVal);
                    },
                    onShouldRetry: (error, retryAttempt) => {
                      return false; // let manual/inline retry logic catch and handle it
                    },
                  });

                  activeTusUploads.set(fileItem.id, upload);

                  // Resume logic
                  upload.findPreviousUploads().then((previousUploads) => {
                    if (previousUploads.length) {
                      upload.resumeFromPreviousUpload(previousUploads[0]);
                    }
                    upload.start();
                  }).catch(() => {
                    upload.start();
                  });
                });

                success = true;
                finalResult = result;
              } catch (err) {
                // If manually cancelled, don't retry and throw/propagate
                if (manuallyCancelledRef.current.has(fileItem.id)) {
                  manuallyCancelledRef.current.delete(fileItem.id);
                  throw err;
                }

                const classified = classifyUploadError(err, "tus");
                if (classified.code === "CANCELLED") {
                  throw err;
                }

                if (!classified.retryable) {
                  updateState("failed", filesRef.current.find(f => f.id === fileItem.id)?.progress || 0, {
                    error: classified.userMessage
                  });
                  throw err;
                }

                attempt++;
                if (attempt >= maxAttempts) {
                  logUploadFailure(fileItem.name, classified.code, classified.userMessage, attempt);
                  updateState("failed", filesRef.current.find(f => f.id === fileItem.id)?.progress || 0, {
                    error: classified.userMessage
                  });
                  throw err;
                }

                const backoffDelay = Math.min(1000 * 2 ** attempt, 30000);
                logRetryAttempt(fileItem.name, attempt, backoffDelay);
                updateState("retrying", filesRef.current.find(f => f.id === fileItem.id)?.progress || 0, {
                  error: `Reconnecting upload...`
                });

                await new Promise((resolve) => setTimeout(resolve, backoffDelay));
              }
            }

            if (success && finalResult) {
              return finalResult;
            } else {
              throw new Error("Upload failed after retry limit reached.");
            }
          } catch (err) {
            const current = filesRef.current.find((f) => f.id === fileItem.id);
            if (current && current.status !== "uploaded") {
              const classified = classifyUploadError(err, "general");
              updateState("failed", current.progress || 0, { error: classified.userMessage });
            }
            throw err;
          }
        })();

        activeUploadPromisesRef.current.set(fileItem.id, uploadPromise);

        try {
          return await uploadPromise;
        } finally {
          activeUploadPromisesRef.current.delete(fileItem.id);
        }
      },
      [shopId, orderId, onChange]
    );

    // Keep the ref in sync
    useEffect(() => {
      uploadSingleFileRef.current = uploadSingleFile;
    }, [uploadSingleFile]);

    // ── Background Auto-Uploader ─────────────────────────────────────────────
    useEffect(() => {
      if (disabled) return;

      const activeUploads = files.filter(
        (f) => f.status === "uploading" || f.status === "compressing" || f.status === "retrying"
      );
      const activeCount = activeUploads.length;
      const slotsAvailable = 2 - activeCount;

      if (slotsAvailable <= 0) return;

      const queuedFiles = files.filter(
        (f) => f.status === "queued" && !activeUploadPromisesRef.current.has(f.id)
      );

      if (queuedFiles.length === 0) return;

      const filesToUpload = queuedFiles.slice(0, slotsAvailable);
      filesToUpload.forEach((fileItem) => {
        uploadSingleFile(fileItem).catch((err) => {
          console.warn(`[Auto-uploader] upload failed for ${fileItem.name}:`, err);
        });
      });
    }, [files, disabled, uploadSingleFile]);

    // ── uploadAll (exposed via ref) ───────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      async uploadAll() {
        if (filesRef.current.length === 0) {
          toast.error("Please add at least one file before placing your order.");
          return { success: false, files: filesRef.current, failedCount: 0 };
        }

        isUploadingRef.current = true;

        try {
          // Synchronously queue all "failed" uploads so they are picked up
          const updatedFiles = filesRef.current.map((f) =>
            f.status === "failed"
              ? { ...f, status: "queued" as const, progress: 0, error: undefined }
              : f
          );
          filesRef.current = updatedFiles;
          onChange(updatedFiles);

          // Wait 50ms for state to settle slightly
          await new Promise((resolve) => setTimeout(resolve, 50));

          // Helper to wait for all files to settle (either "uploaded" or "failed") with limit of 2 concurrent
          const waitForAllSettled = async (): Promise<UploadedFile[]> => {
            while (true) {
              const activeCount = filesRef.current.filter(
                (f) => f.status === "uploading" || f.status === "compressing" || f.status === "retrying"
              ).length;

              const queued = filesRef.current.filter(
                (f) => f.status === "queued" && !activeUploadPromisesRef.current.has(f.id)
              );

              const slotsAvailable = 2 - activeCount;
              if (slotsAvailable > 0 && queued.length > 0) {
                const filesToStart = queued.slice(0, slotsAvailable);
                filesToStart.forEach((f) => {
                  uploadSingleFile(f).catch((err) =>
                    console.warn(`[uploadAll] Auto-start queued file failed for ${f.name}:`, err)
                  );
                });
                await new Promise((resolve) => setTimeout(resolve, 50));
                continue;
              }

              const activePromises = Array.from(activeUploadPromisesRef.current.values());
              if (activePromises.length > 0) {
                await Promise.race(activePromises.map((p) => p.catch(() => {})));
                await new Promise((resolve) => setTimeout(resolve, 50));
                continue;
              }

              if (queued.length === 0 && activePromises.length === 0) {
                break;
              }
            }
            return filesRef.current;
          };

          const settledFiles = await waitForAllSettled();
          const failedCount = settledFiles.filter((f) => f.status === "failed").length;

          if (failedCount > 0) {
            return { success: false, files: settledFiles, failedCount };
          }

          return { success: true, files: settledFiles, failedCount: 0 };
        } catch (err) {
          console.error("[MultiFileUploader] uploadAll error:", err);
          return { success: false, files: filesRef.current, failedCount: 1 };
        } finally {
          isUploadingRef.current = false;
        }
      },

      async retryFailed() {
        const failedFiles = filesRef.current.filter((f) => f.status === "failed");
        if (failedFiles.length === 0) return;

        onChange((prev) =>
          prev.map((f) =>
            f.status === "failed"
              ? { ...f, status: "queued" as const, progress: 0, error: undefined }
              : f
          )
        );
      },

      clearSession() {
        localStorage.removeItem("smartprint_upload_metadata");
        indexedDbStore.clear();
        onChange([]);
      }
    }));

    // ── Individual file retry ─────────────────────────────────────────────────
    const handleRetryFile = useCallback(
      async (id: string) => {
        const fileItem = filesRef.current.find((f) => f.id === id);
        if (!fileItem || disabled) return;

        onChange((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, status: "queued" as const, progress: 0, error: undefined }
              : f
          )
        );
      },
      [onChange, disabled]
    );

    // ── Retry all failed files ────────────────────────────────────────────────
    const handleRetryAll = useCallback(async () => {
      const failedFiles = filesRef.current.filter((f) => f.status === "failed");
      if (failedFiles.length === 0 || disabled) return;

      onChange((prev) =>
        prev.map((f) =>
          f.status === "failed"
            ? { ...f, status: "queued" as const, progress: 0, error: undefined }
            : f
        )
      );

      toast.info(`Retrying ${failedFiles.length} file${failedFiles.length > 1 ? "s" : ""}…`);
    }, [onChange, disabled]);

    // ─── Computed summary ─────────────────────────────────────────────────────
    const successCount = files.filter((f) => f.status === "uploaded").length;
    const failedCount = files.filter((f) => f.status === "failed").length;
    const uploadingCount = files.filter(
      (f) =>
        f.status === "uploading" ||
        f.status === "compressing" ||
        f.status === "retrying" ||
        f.status === "finalizing"
    ).length;
    const queuedCount = files.filter((f) => f.status === "queued").length;
    const activeOrQueuedCount = uploadingCount + queuedCount;

    return (
      <div className="space-y-5">
        {/* Offline Warning Banner */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-amber-800">
                <WifiOff className="w-4 h-4 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-xs font-bold">
                    You&apos;re offline — uploads paused
                  </p>
                  <p className="text-[10px] font-medium text-amber-700 mt-0.5">
                    Active uploads will resume automatically when you reconnect.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sticky upload status strip — visible during batch uploads */}
        <AnimatePresence>
          {activeOrQueuedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-emerald-600 rounded-2xl px-4 py-2.5 flex items-center gap-3"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Loader2 className="w-3.5 h-3.5 text-emerald-200 animate-spin shrink-0" />
                <p className="text-xs font-bold text-white truncate">
                  {uploadingCount > 0
                    ? `Uploading ${uploadingCount} file${uploadingCount > 1 ? "s" : ""}`
                    : "Preparing uploads..."}
                  {queuedCount > 0 && uploadingCount > 0 ? ` · ${queuedCount} queued` : ""}
                </p>
              </div>
              {/* Overall progress pill */}
              <span className="text-[10px] font-black text-emerald-200 tabular-nums shrink-0">
                {successCount}/{files.length} done
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dropzone */}
        <div className={files.length >= 20 ? "opacity-50 pointer-events-none" : ""}>
          <MultiFileDropzone
            onFilesSelected={handleFilesSelected}
            disabled={disabled || files.length >= 20}
          />
        </div>

        {/* Header row */}
        {files.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Files ({files.length}/20)
              </p>
              {/* Upload status badges */}
              <AnimatePresence mode="popLayout">
                {activeOrQueuedCount > 0 && (
                  <motion.span
                    key="uploading"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-wider"
                  >
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    Uploading {activeOrQueuedCount}
                  </motion.span>
                )}
                {successCount > 0 && activeOrQueuedCount === 0 && failedCount === 0 && (
                  <motion.span
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-wider"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    {successCount} Ready
                  </motion.span>
                )}
                {failedCount > 0 && (
                  <motion.span
                    key="failed"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[9px] font-black uppercase tracking-wider"
                  >
                    <AlertCircle className="w-2.5 h-2.5" />
                    {failedCount} Failed
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-3">
              {/* Retry All Failed button */}
              {failedCount > 0 && !disabled && (
                <button
                  onClick={handleRetryAll}
                  className="flex items-center gap-1 text-xs font-extrabold text-amber-600 hover:text-amber-700 transition active:scale-95"
                >
                  <RefreshCw className="w-3 h-3 shrink-0" />
                  Retry All
                </button>
              )}
              {/* Clear All */}
              {files.length > 0 && !disabled && (
                <button
                  onClick={() => {
                    activeTusUploads.forEach((upload) => upload.abort(true));
                    activeTusUploads.clear();
                    activeUploadPromisesRef.current.clear();
                    onChange([]);
                  }}
                  className="text-xs font-extrabold text-red-500 hover:text-red-600 transition"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
        )}

        {/* Reorderable Files List */}
        <Reorder.Group
          values={files}
          onReorder={(newOrder) => onChange(newOrder)}
          className="space-y-3"
          axis="y"
        >
          <AnimatePresence initial={false}>
            {files.map((fileItem) => (
              <ReorderItemRow
                key={fileItem.id}
                fileItem={fileItem}
                disabled={!!disabled}
                onRemove={handleRemoveFile}
                onUpdateConfig={handleUpdateConfig}
                onRetry={handleRetryFile}
                onCancel={handleCancelUpload}
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>
      </div>
    );
  }
);

MultiFileUploader.displayName = "MultiFileUploader";

// ─── Sub-component: Individual File Row ──────────────────────────────────────

function ReorderItemRow({
  fileItem,
  disabled,
  onRemove,
  onUpdateConfig,
  onRetry,
  onCancel,
}: {
  fileItem: UploadedFile;
  disabled: boolean;
  onRemove: (id: string) => void;
  onUpdateConfig: (
    id: string,
    updates: Partial<Pick<UploadedFile, "copies" | "color" | "doubleSided" | "pages">>
  ) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const dragControls = useDragControls();
  const isPdf = fileItem.file?.type === "application/pdf" || fileItem.name.toLowerCase().endsWith(".pdf");
  const isActivelyUploading =
    fileItem.status === "uploading" ||
    fileItem.status === "compressing" ||
    fileItem.status === "queued" ||
    fileItem.status === "retrying" ||
    fileItem.status === "finalizing";

  // Local object URL for image thumbnail
  const [thumbUrl, setThumbUrl] = useState<string>("");
  useEffect(() => {
    if (!isPdf && fileItem.file) {
      const url = URL.createObjectURL(fileItem.file);
      setThumbUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [fileItem.file, isPdf]);



  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec <= 0) return "";
    if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    if (bytesPerSec >= 1024) return `${Math.round(bytesPerSec / 1024)} KB/s`;
    return `${bytesPerSec} B/s`;
  };

  const formatEta = (secs: number) => {
    if (secs <= 0) return "";
    if (secs < 60) return `~${secs}s`;
    return `~${Math.ceil(secs / 60)}m`;
  };

  // Determine border / shadow style based on status
  const cardStyle = (() => {
    switch (fileItem.status) {
      case "failed":
        return "border-rose-200 shadow-rose-50 shadow-sm bg-rose-50/30";
      case "uploaded":
        return "border-emerald-100 shadow-emerald-50/60 shadow-sm bg-emerald-50/20";
      case "uploading":
      case "retrying":
      case "finalizing":
        return "border-emerald-200 shadow-sm";
      case "compressing":
        return "border-indigo-200 shadow-sm";
      case "queued":
        return "border-blue-100 shadow-sm bg-blue-50/5";
      default:
        return "border-slate-100 shadow-sm";
    }
  })();

  return (
    <Reorder.Item
      value={fileItem}
      dragListener={false}
      dragControls={dragControls}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ duration: 0.2 }}
      className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${cardStyle}`}
    >
      {/* Progress bar at very top of card */}
      {(fileItem.status === "uploading" || fileItem.status === "retrying") && (
        <div className="h-0.5 w-full bg-slate-100 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${fileItem.progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
      )}
      {fileItem.status === "compressing" && (
        <div className="h-0.5 w-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 rounded-full animate-pulse"
            style={{ width: "60%" }}
          />
        </div>
      )}
      {fileItem.status === "queued" && (
        <div className="h-0.5 w-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-300 via-sky-300 to-blue-300 rounded-full animate-pulse"
            style={{ width: "20%" }}
          />
        </div>
      )}
      {/* Success: full green bar */}
      {fileItem.status === "uploaded" && (
        <div className="h-0.5 w-full bg-emerald-400" />
      )}

      <div className="p-4 flex gap-3 items-start">
        {/* Drag Handle */}
        <div
          onPointerDown={(e) => !disabled && !isActivelyUploading && dragControls.start(e)}
          className={`h-12 flex items-center justify-center text-slate-300 px-1 ${
            disabled || isActivelyUploading
              ? "cursor-not-allowed opacity-20"
              : "cursor-grab hover:text-slate-400 active:cursor-grabbing"
          }`}
        >
          <GripVertical className="w-4 h-4 shrink-0" />
        </div>

        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 relative">
          {fileItem.status === "uploaded" && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center z-10"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </motion.div>
          )}
          {isPdf ? (
            <div className="w-full h-full bg-rose-50 flex flex-col items-center justify-center text-rose-500">
              <FileText className="w-6 h-6" />
              <span className="text-[7px] font-black uppercase tracking-widest mt-0.5">PDF</span>
            </div>
          ) : thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt={fileItem.name} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-5 h-5 text-slate-400" />
          )}
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <h4
                className="text-sm font-extrabold text-slate-800 truncate"
                title={fileItem.name}
              >
                {fileItem.name}
              </h4>
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">
                {formatSize(fileItem.size)}
                {fileItem.pages !== null ? ` · ${fileItem.pages} pgs` : " · counting pages…"}
              </p>
            </div>

            {/* Action buttons (top-right) */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Cancel during upload */}
              {isActivelyUploading && !disabled && (
                <button
                  type="button"
                  onClick={() => onCancel(fileItem.id)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-amber-500 transition"
                  title="Cancel upload"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              {/* Delete (only when not uploading) */}
              {!disabled && !isActivelyUploading && (
                <button
                  type="button"
                  onClick={() => onRemove(fileItem.id)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition"
                  title="Remove file"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Config Controls (queued / failed states) */}
          {(fileItem.status === "queued" || fileItem.status === "failed") && (
            <div className="mt-3 pt-3 border-t border-slate-100/70 flex flex-wrap items-center gap-3">
              {/* Copies */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig(fileItem.id, { copies: Math.max(1, fileItem.copies - 1) })
                  }
                  disabled={disabled}
                  className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center transition disabled:opacity-40"
                >
                  <Minus className="w-3 h-3 text-slate-500" />
                </button>
                <span className="text-xs font-extrabold text-slate-700 min-w-4 text-center">
                  {fileItem.copies}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig(fileItem.id, { copies: Math.min(50, fileItem.copies + 1) })
                  }
                  disabled={disabled}
                  className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center transition disabled:opacity-40"
                >
                  <Plus className="w-3 h-3 text-slate-600" />
                </button>
              </div>

              {/* Ink Mode */}
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => onUpdateConfig(fileItem.id, { color: false })}
                  disabled={disabled}
                  className={`px-3 py-1 rounded-md text-[10px] font-extrabold transition ${
                    !fileItem.color ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                  }`}
                >
                  B&amp;W
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateConfig(fileItem.id, { color: true })}
                  disabled={disabled}
                  className={`px-3 py-1 rounded-md text-[10px] font-extrabold transition ${
                    fileItem.color ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500"
                  }`}
                >
                  Color
                </button>
              </div>

              {/* Duplex (PDFs only) */}
              {isPdf && (
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => onUpdateConfig(fileItem.id, { doubleSided: false })}
                    disabled={disabled}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition ${
                      !fileItem.doubleSided ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    1-Sided
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateConfig(fileItem.id, { doubleSided: true })}
                    disabled={disabled}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition ${
                      fileItem.doubleSided ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    2-Sided
                  </button>
                </div>
              )}

              {/* Manual page override (PDF parse failed) */}
              {fileItem.pdfParseFailed && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl p-0.5 ml-auto">
                  <span className="text-[9px] font-extrabold text-amber-700 uppercase tracking-wider pl-1.5">
                    Pages:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig(fileItem.id, { pages: Math.max(1, (fileItem.pages || 1) - 1) })
                    }
                    disabled={disabled}
                    className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center transition"
                  >
                    <Minus className="w-3 h-3 text-amber-600" />
                  </button>
                  <span className="text-xs font-black text-amber-900 min-w-4 text-center">
                    {fileItem.pages || 1}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig(fileItem.id, {
                        pages: Math.min(500, (fileItem.pages || 1) + 1),
                      })
                    }
                    disabled={disabled}
                    className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center transition"
                  >
                    <Plus className="w-3 h-3 text-amber-700" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Upload Progress State */}
          {isActivelyUploading && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500 flex items-center gap-1.5">
                  {fileItem.status === "compressing" && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      <span className="text-indigo-600">Optimizing image…</span>
                    </>
                  )}
                  {fileItem.status === "uploading" && (
                    <>
                      <Upload className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-700">
                        {fileItem.error ? fileItem.error : "Uploading…"}
                      </span>
                    </>
                  )}
                  {fileItem.status === "retrying" && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      <span className="text-amber-700">
                        {fileItem.error ? fileItem.error : "Reconnecting upload…"}
                      </span>
                    </>
                  )}
                  {fileItem.status === "finalizing" && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                      <span className="text-emerald-700">Finalizing…</span>
                    </>
                  )}
                  {fileItem.status === "queued" && (
                    <>
                      <Clock className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                      <span className="text-blue-700">Queued…</span>
                    </>
                  )}
                </span>
                {(fileItem.status === "uploading" || fileItem.status === "retrying") && (
                  <span className="font-extrabold text-emerald-600 tabular-nums">
                    {fileItem.progress}%
                  </span>
                )}
              </div>

              {/* Speed + ETA row */}
              {fileItem.status === "uploading" &&
                !fileItem.error &&
                (fileItem.uploadSpeed ?? 0) > 0 && (
                  <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      {formatSpeed(fileItem.uploadSpeed ?? 0)}
                    </span>
                    {(fileItem.etaSeconds ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-300" />
                        {formatEta(fileItem.etaSeconds ?? 0)}
                      </span>
                    )}
                  </div>
                )}

              {/* Thick progress bar */}
              {(fileItem.status === "uploading" || fileItem.status === "retrying") && (
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${fileItem.progress}%` }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Success State */}
          {fileItem.status === "uploaded" && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2.5 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Upload complete — ready for print
            </motion.div>
          )}

          {/* Failure Panel — exact reason + retry */}
          {fileItem.status === "failed" && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2.5 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5 space-y-2"
            >
              <div className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-rose-700 leading-snug">
                  {fileItem.error ?? "Upload failed. Tap Retry to try again."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRetry(fileItem.id)}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-[10px] font-black text-rose-800 uppercase tracking-wider transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3 shrink-0" />
                Retry file
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </Reorder.Item>
  );
}
