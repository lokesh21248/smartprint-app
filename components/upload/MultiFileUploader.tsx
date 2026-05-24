"use client";

/**
 * MultiFileUploader.tsx
 *
 * Pure UI component — all upload logic lives in UploadQueueManager + useUploadQueue.
 * This component is responsible ONLY for:
 *  - Rendering the file list, progress bars, and status badges
 *  - Forwarding user actions (add, remove, retry, cancel) to the queue hook
 *  - Exposing an imperative ref handle for uploadAll / retryFailed / clearSession
 */

import dynamic from "next/dynamic";
import {
  useImperativeHandle,
  forwardRef,
  useEffect,
  useState,
  memo,
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
import type { UploadedFile } from "@/types";
import { useUploadQueue, createUploadQueueHandle } from "@/hooks/useUploadQueue";

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

// ─── Public interface ─────────────────────────────────────────────────────────

export interface MultiFileUploaderRef {
  uploadAll: () => Promise<{ success: boolean; files: UploadedFile[]; failedCount: number }>;
  retryFailed: () => void;
  clearSession: () => void;
  cancelAll: () => void;
  clear: () => void;
}

interface MultiFileUploaderProps {
  /** Controlled list — kept in sync with queue events via onChange. */
  files: UploadedFile[];
  onChange: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  shopId: string;
  orderId: string;
  disabled?: boolean;
}

// ─── Validation constants ─────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);
const ALLOWED_EXTS = new Set(["pdf", "png", "jpg", "jpeg", "webp"]);
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // Hardened 500MB size limit
const MAX_FILES = 50; // Hardened 50 files limit

// ─── Component ────────────────────────────────────────────────────────────────

export const MultiFileUploader = memo(
  forwardRef<MultiFileUploaderRef, MultiFileUploaderProps>(
    ({ files, onChange, shopId, orderId, disabled }, ref) => {
    // ── Upload queue ──────────────────────────────────────────────────────────
    const {
      files: queueFiles,
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
      managerRef,
    } = useUploadQueue({ shopId, orderId, disabled });

    // ── Keep parent state in sync ─────────────────────────────────────────────
    useEffect(() => {
      onChange(queueFiles);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queueFiles]);

    // ── Expose imperative handle ──────────────────────────────────────────────
    useImperativeHandle(
      ref,
      () => createUploadQueueHandle(managerRef) as MultiFileUploaderRef,
      [managerRef]
    );

    // ── File selection + validation ───────────────────────────────────────────
    const handleFilesSelected = (newRawFiles: File[]) => {
      if (disabled) return;

      const validFiles: File[] = [];

      for (const file of newRawFiles) {
        if (queueFiles.length + validFiles.length >= MAX_FILES) {
          toast.error("Maximum 50 files allowed per order.");
          break;
        }

        const type = file.type.toLowerCase();
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

        if (!ALLOWED_TYPES.has(type) && !ALLOWED_EXTS.has(ext)) {
          toast.error(`"${file.name}" is not supported. Only PDF, PNG, and JPG files are accepted.`);
          continue;
        }
        if ((type.includes("heic") || ext === "heic") && file.size > 50 * 1024 * 1024) {
          toast.error(`"${file.name}" (HEIC) exceeds the 50 MB size limit.`);
          continue;
        }
        if (file.size > MAX_SIZE_BYTES) {
          toast.error(`"${file.name}" exceeds the 500 MB size limit.`);
          continue;
        }
        if (file.size === 0) {
          toast.error(`"${file.name}" is empty (0 bytes) and cannot be uploaded.`);
          continue;
        }
        if (
          file.name.includes("..") ||
          file.name.includes("/") ||
          file.name.includes("\\") ||
          file.name.includes("\0")
        ) {
          toast.error(`"${file.name}" has an invalid filename.`);
          continue;
        }
        const isDuplicate = queueFiles.some(
          (f) => f.name === file.name && f.size === file.size
        );
        if (isDuplicate) {
          toast.warning(`"${file.name}" is already in your list.`);
          continue;
        }

        validFiles.push(file);
      }

      if (validFiles.length > 0) {
        addFiles(validFiles);
      }
    };

    // ── Summary counts ────────────────────────────────────────────────────────
    const successCount = queueFiles.filter((f) => f.status === "success").length;
    const failedCount  = queueFiles.filter((f) => f.status === "failed" || f.status === "cancelled").length;
    const uploadingCount = queueFiles.filter((f) => f.status === "uploading" || f.status === "processing").length;
    const queuedCount = queueFiles.filter((f) => f.status === "queued" || f.status === "preparing").length;
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
                  <p className="text-xs font-bold">You&apos;re offline — uploads paused</p>
                  <p className="text-[10px] font-medium text-amber-700 mt-0.5">
                    Active uploads will resume automatically when you reconnect.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload status strip */}
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
                    : "Preparing uploads…"}
                  {queuedCount > 0 && uploadingCount > 0 ? ` · ${queuedCount} queued` : ""}
                </p>
              </div>
              <span className="text-[10px] font-black text-emerald-200 tabular-nums shrink-0">
                {successCount}/{queueFiles.length} done
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dropzone */}
        <div className={queueFiles.length >= MAX_FILES ? "opacity-50 pointer-events-none" : ""}>
          <MultiFileDropzone
            onFilesSelected={handleFilesSelected}
            disabled={disabled || queueFiles.length >= MAX_FILES}
          />
        </div>

        {/* Header row */}
        {queueFiles.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Files ({queueFiles.length}/50)
              </p>
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
              {failedCount > 0 && !disabled && (
                <button
                  onClick={retryAll}
                  className="flex items-center gap-1 text-xs font-extrabold text-amber-600 hover:text-amber-700 transition active:scale-95"
                >
                  <RefreshCw className="w-3 h-3 shrink-0" />
                  Retry All
                </button>
              )}
              {queueFiles.length > 0 && !disabled && (
                <button
                  onClick={clearSession}
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
          values={queueFiles}
          onReorder={reorder}
          className="space-y-3"
          axis="y"
        >
          <AnimatePresence initial={false}>
            {queueFiles.map((fileItem) => (
              <ReorderItemRow
                key={fileItem.id}
                fileItem={fileItem}
                disabled={!!disabled}
                onRemove={removeFile}
                onUpdateConfig={updateConfig}
                onRetry={retryFile}
                onCancel={cancelUpload}
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>
      </div>
    );
  }
)
);

MultiFileUploader.displayName = "MultiFileUploader";

// ─── Sub-component: Individual File Row ──────────────────────────────────────

const ReorderItemRow = memo(function ReorderItemRow({
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
    fileItem.status === "queued" ||
    fileItem.status === "preparing" ||
    fileItem.status === "processing";

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
      case "success":
        return "border-emerald-100 shadow-emerald-50/60 shadow-sm bg-emerald-50/20";
      case "uploading":
      case "processing":
        return "border-emerald-200 shadow-sm";
      case "queued":
      case "preparing":
        return "border-slate-100 shadow-sm bg-slate-50/5";
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
      {(fileItem.status === "uploading" || fileItem.status === "processing") && (
        <div className="h-0.5 w-full bg-slate-100 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${fileItem.progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
      )}
      {fileItem.status === "success" && (
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
          {fileItem.status === "success" && (
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

          {/* Config Controls (queued / preparing / failed states) */}
          {(fileItem.status === "queued" || fileItem.status === "preparing" || fileItem.status === "idle" || fileItem.status === "failed" || fileItem.status === "cancelled") && (
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
                  {fileItem.status === "uploading" && (
                    <>
                      <Upload className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-700">
                        {fileItem.error ? fileItem.error : "Uploading…"}
                      </span>
                    </>
                  )}
                  {fileItem.status === "processing" && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin shrink-0" />
                      <span className="text-emerald-700 font-extrabold">
                        {isPdf ? "Counting pages…" : "Processing file…"}
                      </span>
                    </>
                  )}
                  {(fileItem.status === "queued" || fileItem.status === "preparing") && (
                    <>
                      <Clock className="w-3.5 h-3.5 text-slate-500 animate-pulse" />
                      <span className="text-slate-700">
                        {fileItem.error ? fileItem.error : (fileItem.status === "preparing" ? "Preparing upload…" : "Queued…")}
                      </span>
                    </>
                  )}
                </span>
                {(fileItem.status === "uploading" || fileItem.status === "processing") && (
                  <span className="font-extrabold text-emerald-600 tabular-nums">
                    {fileItem.progress}%
                  </span>
                )}
              </div>

              {/* Thick progress bar */}
              {(fileItem.status === "uploading" || fileItem.status === "processing") && (
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
          {fileItem.status === "success" && (
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
          {(fileItem.status === "failed" || fileItem.status === "cancelled") && (
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
});
