"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import { Reorder, useDragControls, motion, AnimatePresence } from "framer-motion";
import { 
  FileText, Trash2, GripVertical, Plus, Minus, 
  CheckCircle2, AlertCircle, RefreshCw, Loader2, 
  Image as ImageIcon, WifiOff, X, Upload
} from "lucide-react";
import { toast } from "sonner";
import pLimit from "p-limit";
import * as tus from "tus-js-client";
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
}

interface MultiFileUploaderProps {
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  shopId: string;
  orderId: string;
  disabled?: boolean;
}

// Track active TUS uploads so we can abort them on cancel
const activeTusUploads = new Map<string, tus.Upload>();

export const MultiFileUploader = forwardRef<MultiFileUploaderRef, MultiFileUploaderProps>(
  ({ files, onChange, shopId, orderId, disabled = false }, ref) => {
    // Track if any files are currently uploading (for beforeunload guard)
    const isUploadingRef = useRef(false);
    const [isOnline, setIsOnline] = useState(
      typeof navigator !== "undefined" ? navigator.onLine : true
    );

    // ── Online/Offline detection with auto-resume ──────────────────────────
    useEffect(() => {
      const handleOnline = () => {
        setIsOnline(true);
        // Find files that failed due to offline and auto-resume them
        const failedFiles = files.filter(
          (f) =>
            f.status === "failed" &&
            (f.error?.includes("No internet") || f.error?.includes("Network error"))
        );
        if (failedFiles.length > 0) {
          failedFiles.forEach((f) => logNetworkResume(f.name));
          toast.success(`Back online! Resuming ${failedFiles.length} upload${failedFiles.length > 1 ? "s" : ""}…`);
          // Mark as idle so they get picked up in the next uploadAll call
          onChange(
            files.map((f) =>
              failedFiles.some((ff) => ff.id === f.id)
                ? { ...f, status: "idle", progress: 0, error: undefined }
                : f
            )
          );
        }
      };
      const handleOffline = () => {
        setIsOnline(false);
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }, [files, onChange]);

    // ── Beforeunload guard during active uploads ───────────────────────────
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

    // ── PDF Page Count Parser ──────────────────────────────────────────────
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

    // ── File Selection Handler ─────────────────────────────────────────────
    const handleFilesSelected = useCallback(
      async (newFiles: File[]) => {
        if (disabled) return;

        const updatedList = [...files];
        let filesAdded = 0;

        for (const file of newFiles) {
          if (updatedList.length >= 20) {
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
            ext === "pdf" ||
            ext === "png" ||
            ext === "jpg" ||
            ext === "jpeg";

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

          // Duplicate check (filename + size)
          const isDuplicate = updatedList.some(
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
            status: "idle",
            copies: 1,
            color: false,
            doubleSided: isPdf,
          };

          updatedList.push(newUploadedFile);
          filesAdded++;

          // Parse PDF pages in background
          if (isPdf) {
            parsePdfPages(file).then(({ count, failed }) => {
              onChange(
                updatedList.map((f) =>
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
          onChange(updatedList);
        }
      },
      [files, onChange, disabled, parsePdfPages]
    );

    // ── Remove File Handler ────────────────────────────────────────────────
    const handleRemoveFile = useCallback(
      (id: string) => {
        if (disabled) return;
        // Abort any active TUS upload for this file
        const activeUpload = activeTusUploads.get(id);
        if (activeUpload) {
          activeUpload.abort(true);
          activeTusUploads.delete(id);
          const fileItem = files.find((f) => f.id === id);
          if (fileItem) logUploadCancelled(fileItem.name);
        }
        onChange(files.filter((f) => f.id !== id));
      },
      [files, onChange, disabled]
    );

    // ── Cancel Active Upload ───────────────────────────────────────────────
    const handleCancelUpload = useCallback(
      (id: string) => {
        const activeUpload = activeTusUploads.get(id);
        if (activeUpload) {
          activeUpload.abort(true);
          activeTusUploads.delete(id);
          const fileItem = files.find((f) => f.id === id);
          if (fileItem) logUploadCancelled(fileItem.name);
        }
        onChange(
          files.map((f) =>
            f.id === id ? { ...f, status: "idle", progress: 0, error: undefined } : f
          )
        );
      },
      [files, onChange]
    );

    // ── Update Print Config ────────────────────────────────────────────────
    const handleUpdateConfig = useCallback(
      (
        id: string,
        updates: Partial<Pick<UploadedFile, "copies" | "color" | "doubleSided" | "pages">>
      ) => {
        onChange(files.map((f) => (f.id === id ? { ...f, ...updates } : f)));
      },
      [files, onChange]
    );

    // ── Core Single-File Upload ────────────────────────────────────────────
    const uploadSingleFile = useCallback(
      async (fileItem: UploadedFile): Promise<UploadedFile> => {
        // Skip if already uploaded (orphan recovery)
        if (fileItem.status === "success" && fileItem.storagePath) {
          return fileItem;
        }

        const startedAt = Date.now();

        const updateState = (
          status: UploadedFile["status"],
          progress: number,
          extra: Partial<UploadedFile> = {}
        ) => {
          onChange((prevFiles) =>
            prevFiles.map((f) =>
              f.id === fileItem.id ? { ...f, status, progress, ...extra } : f
            )
          );
        };

        try {
          let fileToUpload = fileItem.file;

          // ── 1. Image Compression ──────────────────────────────────────────
          if (fileToUpload.type.startsWith("image/")) {
            updateState("compressing", 0);
            try {
              const { compressImageIfNeeded } = await import("@/lib/upload/compressImage");
              // Compress anything > 500KB (previously 3MB — much more aggressive now)
              const compResult = await compressImageIfNeeded(fileToUpload, 500 * 1024);
              logCompressionResult(
                fileItem.name,
                compResult.originalSizeBytes,
                compResult.finalSizeBytes,
                compResult.compressed
              );
              if (compResult.compressed) {
                fileToUpload = compResult.file;
              }
            } catch (compressErr) {
              console.warn("[MultiFileUploader] Compression failed, uploading original:", compressErr);
            }
          }

          // ── 2. Presign Token Request ──────────────────────────────────────
          updateState("uploading", 0);
          logPresignRequest(fileItem.name, fileToUpload.size);

          let presignData: { token: string; storagePath: string };
          try {
            const presignRes = await fetch("/api/storage/presign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shopId,
                fileName: fileToUpload.name,
                fileSize: fileToUpload.size,
                mimeType: fileToUpload.type,
                orderId,
              }),
            });

            if (!presignRes.ok) {
              const errBody = await presignRes.json().catch(() => ({})) as { error?: string };
              const presignError = new Error(errBody.error || `Server error (${presignRes.status})`);
              logPresignResult(fileItem.name, false, presignError.message);
              // For auth / rate-limit errors, classify from the HTTP status
              const classified = classifyUploadError(
                { originalResponse: { getStatus: () => presignRes.status, getBody: () => errBody.error ?? "" } },
                "presign"
              );
              updateState("failed", 0, { error: classified.userMessage });
              throw presignError;
            }

            presignData = await presignRes.json() as { token: string; storagePath: string };
            logPresignResult(fileItem.name, true);
          } catch (presignErr) {
            if (!(presignErr instanceof Error && presignErr.message.startsWith("Server error"))) {
              const classified = classifyUploadError(presignErr, "presign");
              updateState("failed", 0, { error: classified.userMessage });
            }
            throw presignErr;
          }

          const { token, storagePath } = presignData;

          // ── 3. TUS Resumable Upload ───────────────────────────────────────
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          if (!supabaseUrl) {
            throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
          }
          const endpoint = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;

          logUploadStart(fileItem.name, fileToUpload.size);

          return new Promise<UploadedFile>((resolve, reject) => {
            const upload = new tus.Upload(fileToUpload, {
              endpoint,
              // Retry up to 4 times with increasing backoff — handles mobile 4G drops
              retryDelays: [500, 1500, 3000, 6000],
              headers: {
                "x-signature": token,
                "x-upsert": "true",
              },
              metadata: {
                bucketName: "order-files",
                objectName: storagePath,
                contentType: fileToUpload.type || "application/octet-stream",
              },
              // 5MB chunks — slightly below 6MB Supabase requirement for network safety
              chunkSize: 5 * 1024 * 1024,
              onBeforeRequest: (req) => {
                // Pause if we've gone offline mid-upload
                if (!navigator.onLine) {
                  logNetworkPause(fileItem.name);
                }
                return req;
              },
              onError: (error) => {
                const classified = classifyUploadError(error, "tus");
                logUploadFailure(fileItem.name, classified.code, classified.userMessage, 1);
                updateState("failed", 0, { error: classified.userMessage });
                activeTusUploads.delete(fileItem.id);
                reject(error);
              },
              onProgress: (bytesSent, bytesTotal) => {
                const pct = bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0;
                logUploadChunk(fileItem.name, pct, bytesSent, bytesTotal);
                updateState("uploading", pct);
              },
              onSuccess: () => {
                const durationMs = Date.now() - startedAt;
                logUploadSuccess(fileItem.name, fileToUpload.size, storagePath, durationMs);
                activeTusUploads.delete(fileItem.id);

                const result: UploadedFile = {
                  ...fileItem,
                  status: "success",
                  progress: 100,
                  storagePath,
                  error: undefined,
                };
                onChange((prevFiles) =>
                  prevFiles.map((f) => (f.id === fileItem.id ? result : f))
                );
                resolve(result);
              },
              onShouldRetry: (error, retryAttempt) => {
                const classified = classifyUploadError(error, "tus");
                // Don't retry non-retryable errors (wrong file type, auth failed permanently etc)
                if (!classified.retryable) return false;
                logRetryAttempt(fileItem.name, retryAttempt + 1, [500, 1500, 3000, 6000][retryAttempt] ?? 6000);
                updateState("retrying", 0, { error: `Retrying… (attempt ${retryAttempt + 1})` });
                return true;
              },
            });

            // Track for cancel support
            activeTusUploads.set(fileItem.id, upload);
            upload.start();
          });
        } catch (err) {
          // Only classify & set state if not already set by inner catch blocks
          const fileState = files.find((f) => f.id === fileItem.id);
          if (!fileState?.error) {
            const classified = classifyUploadError(err, "general");
            updateState("failed", 0, { error: classified.userMessage });
          }
          throw err;
        }
      },
      [shopId, orderId, onChange, files]
    );

    // ── uploadAll (exposed via ref) ────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      async uploadAll() {
        if (files.length === 0) {
          toast.error("Please add at least one file before placing your order.");
          return { success: false, files, failedCount: 0 };
        }

        const pendingFiles = files.filter((f) => f.status !== "success");
        if (pendingFiles.length === 0) {
          return { success: true, files, failedCount: 0 };
        }

        isUploadingRef.current = true;

        // Max 2 concurrent uploads for mobile stability
        const limit = pLimit(2);
        const uploadPromises = files.map((fileItem) =>
          limit(async () => {
            if (fileItem.status === "success" && fileItem.storagePath) {
              return fileItem;
            }
            if (fileItem.status === "failed") {
              onChange((prev) =>
                prev.map((f) =>
                  f.id === fileItem.id
                    ? { ...f, status: "retrying" as const, progress: 0, error: undefined }
                    : f
                )
              );
            }
            return uploadSingleFile({ ...fileItem, status: "uploading", progress: 0 });
          })
        );

        try {
          const results = await Promise.allSettled(uploadPromises);
          const successFiles: UploadedFile[] = [];
          let failedCount = 0;

          results.forEach((r) => {
            if (r.status === "fulfilled") {
              successFiles.push(r.value);
            } else {
              failedCount++;
            }
          });

          if (failedCount > 0) {
            // Error is already shown inline per-file — don't show generic toast
            return { success: false, files: successFiles, failedCount };
          }

          return { success: true, files: successFiles, failedCount: 0 };
        } catch (err) {
          console.error("[MultiFileUploader] Parallel upload error:", err);
          return { success: false, files, failedCount: 1 };
        } finally {
          isUploadingRef.current = false;
        }
      },

      async retryFailed() {
        const failedFiles = files.filter((f) => f.status === "failed");
        if (failedFiles.length === 0) return;

        const limit = pLimit(2);
        await Promise.allSettled(
          failedFiles.map((fileItem) =>
            limit(async () => {
              onChange((prev) =>
                prev.map((f) =>
                  f.id === fileItem.id
                    ? { ...f, status: "retrying" as const, progress: 0, error: undefined }
                    : f
                )
              );
              try {
                await uploadSingleFile({ ...fileItem, status: "retrying", progress: 0 });
                toast.success(`"${fileItem.name}" uploaded successfully!`);
              } catch {
                // Error already shown inline
              }
            })
          )
        );
      },
    }));

    // ── Individual file retry ──────────────────────────────────────────────
    const handleRetryFile = useCallback(
      async (id: string) => {
        const fileItem = files.find((f) => f.id === id);
        if (!fileItem || disabled) return;

        onChange((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, status: "retrying" as const, progress: 0, error: undefined }
              : f
          )
        );

        try {
          await uploadSingleFile({ ...fileItem, status: "retrying", progress: 0, error: undefined });
          toast.success(`"${fileItem.name}" uploaded successfully!`);
        } catch {
          // Error already surfaced inline in the file card
        }
      },
      [files, uploadSingleFile, onChange, disabled]
    );

    // ─── Computed summary ─────────────────────────────────────────────────
    const successCount = files.filter((f) => f.status === "success").length;
    const failedCount = files.filter((f) => f.status === "failed").length;
    const uploadingCount = files.filter(
      (f) => f.status === "uploading" || f.status === "compressing" || f.status === "retrying"
    ).length;

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
                <p className="text-xs font-bold">
                  You&apos;re offline — uploads will resume automatically when reconnected.
                </p>
              </div>
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
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Files ({files.length}/20)
            </p>
            {/* Upload status badges */}
            <AnimatePresence>
              {uploadingCount > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-wider"
                >
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Uploading {uploadingCount}
                </motion.span>
              )}
              {successCount > 0 && uploadingCount === 0 && failedCount === 0 && (
                <motion.span
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
          {files.length > 0 && !disabled && (
            <button
              onClick={() => {
                // Abort all active uploads
                activeTusUploads.forEach((upload) => upload.abort(true));
                activeTusUploads.clear();
                onChange([]);
              }}
              className="text-xs font-extrabold text-red-500 hover:text-red-600 transition"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Reorderable Files List */}
        <Reorder.Group
          values={files}
          onReorder={onChange}
          className="space-y-3"
          axis="y"
        >
          <AnimatePresence initial={false}>
            {files.map((fileItem) => (
              <ReorderItemRow
                key={fileItem.id}
                fileItem={fileItem}
                disabled={disabled}
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
  onUpdateConfig: (id: string, updates: Partial<Pick<UploadedFile, "copies" | "color" | "doubleSided" | "pages">>) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const dragControls = useDragControls();
  const isPdf = fileItem.file.type === "application/pdf" || fileItem.name.endsWith(".pdf");
  const isActivelyUploading =
    fileItem.status === "uploading" ||
    fileItem.status === "compressing" ||
    fileItem.status === "retrying";

  // Local object URL for image thumbnail
  const [thumbUrl, setThumbUrl] = useState<string>("");
  useEffect(() => {
    if (!isPdf) {
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
      className={`
        bg-white rounded-2xl border transition-all duration-200 overflow-hidden
        ${fileItem.status === "failed" ? "border-rose-200 shadow-rose-50 shadow-sm" : 
          fileItem.status === "success" ? "border-emerald-100 shadow-emerald-50 shadow-sm" : 
          "border-slate-100 shadow-sm"}
      `}
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
          <div className="h-full bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 rounded-full animate-pulse" 
               style={{ width: "60%" }} />
        </div>
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
          {fileItem.status === "success" && (
            <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center z-10">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
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
              <h4 className="text-sm font-extrabold text-slate-800 truncate" title={fileItem.name}>
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

          {/* Config Controls (idle / failed states) */}
          {(fileItem.status === "idle" || fileItem.status === "failed") && (
            <div className="mt-3 pt-3 border-t border-slate-100/70 flex flex-wrap items-center gap-3">
              {/* Copies */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => onUpdateConfig(fileItem.id, { copies: Math.max(1, fileItem.copies - 1) })}
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
                  onClick={() => onUpdateConfig(fileItem.id, { copies: Math.min(50, fileItem.copies + 1) })}
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
                    onClick={() => onUpdateConfig(fileItem.id, { pages: Math.max(1, (fileItem.pages || 1) - 1) })}
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
                    onClick={() => onUpdateConfig(fileItem.id, { pages: Math.min(500, (fileItem.pages || 1) + 1) })}
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
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500 flex items-center gap-1.5">
                  {fileItem.status === "compressing" && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      <span className="text-indigo-600">Compressing image…</span>
                    </>
                  )}
                  {fileItem.status === "uploading" && (
                    <>
                      <Upload className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-700">Uploading…</span>
                    </>
                  )}
                  {fileItem.status === "retrying" && (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      <span className="text-amber-700">
                        {fileItem.error ?? "Retrying…"}
                      </span>
                    </>
                  )}
                </span>
                {fileItem.status === "uploading" && (
                  <span className="font-extrabold text-emerald-600 tabular-nums">
                    {fileItem.progress}%
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Success State */}
          {fileItem.status === "success" && (
            <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Upload complete
            </div>
          )}

          {/* Failure Panel — shows exact reason + retry */}
          {fileItem.status === "failed" && (
            <div className="mt-2.5 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5 space-y-1.5">
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
                className="inline-flex items-center gap-1 text-[10px] font-black text-rose-800 hover:text-rose-950 uppercase tracking-wider hover:underline disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3 shrink-0" />
                Retry file
              </button>
            </div>
          )}
        </div>
      </div>
    </Reorder.Item>
  );
}
