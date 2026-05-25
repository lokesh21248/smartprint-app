"use client";

/**
 * FilePreviewCard — premium file card shown after a file is selected.
 *
 * Shows:
 * - File type icon (PDF vs Image) with accent colour
 * - File name + formatted size
 * - Detected page count (PDFs only, when available)
 * - Animated upload progress bar
 * - Status badge: idle / uploading / success / error
 * - Remove button
 *
 * All animations via Framer Motion. No extra dependencies.
 *
 * @module components/upload/FilePreviewCard
 */

import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { formatBytes } from "@/lib/upload/fileValidation";
import type { UploadStatus } from "@/hooks/useSafeFileUpload";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilePreviewCardProps {
  file: File;
  pageCount?: number | null;
  status?: UploadStatus;
  progress?: number; // 0–100
  error?: string | null;
  onRemove?: () => void;
}

// ─── Status config map ────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  idle: {
    label: "Ready to upload",
    labelClass: "text-slate-500",
    barClass: "bg-emerald-500",
    showBar: false,
  },
  presigning: {
    label: "Preparing...",
    labelClass: "text-slate-500",
    barClass: "bg-emerald-400",
    showBar: true,
  },
  uploading: {
    label: "Uploading...",
    labelClass: "text-emerald-700",
    barClass: "bg-gradient-to-r from-emerald-500 to-teal-400",
    showBar: true,
  },
  success: {
    label: "Uploaded",
    labelClass: "text-emerald-700",
    barClass: "bg-emerald-500",
    showBar: true,
  },
  error: {
    label: "Upload failed",
    labelClass: "text-rose-600",
    barClass: "bg-rose-400",
    showBar: false,
  },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function FilePreviewCard({
  file,
  pageCount,
  status = "idle",
  progress = 0,
  error,
  onRemove,
}: FilePreviewCardProps) {
  const isPdf = file.type === "application/pdf";
  const cfg = STATUS_CONFIG[status];

  const displayProgress =
    status === "presigning" ? undefined : // indeterminate
    status === "success" ? 100 :
    progress;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center gap-3 transition-all duration-300 relative"
    >
      {/* File type icon centered */}
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
          isPdf
            ? "bg-rose-50 border border-rose-100 text-rose-500"
            : "bg-violet-50 border border-violet-100 text-violet-500"
        }`}
      >
        {isPdf ? (
          <FileText className="w-7 h-7" />
        ) : (
          <ImageIcon className="w-7 h-7" />
        )}
      </div>

      {/* File info centered */}
      <div className="text-center w-full min-w-0">
        <p className="font-extrabold text-slate-800 text-base truncate px-4 leading-snug">
          {file.name}
        </p>
        <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
            {formatBytes(file.size)}
          </span>
          {pageCount !== null && pageCount !== undefined && isPdf && (
            <>
              <span className="text-slate-300 font-bold">·</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                {pageCount} {pageCount === 1 ? "page" : "pages"}
              </span>
            </>
          )}
          {/* Status badge */}
          <span className="text-slate-300 font-bold">·</span>
          <span className={`text-[10px] font-black uppercase tracking-wider ${cfg.labelClass}`}>
            {status === "uploading"
              ? `${displayProgress ?? 0}%`
              : cfg.label}
          </span>
        </div>
      </div>

      {/* Upload Progress Section BELOW preview card details */}
      {(status === "uploading" || status === "presigning" || status === "success") && (
        <div className="mt-2 w-full max-w-[280px]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1.5 px-0.5">
            <span>
              {status === "presigning" ? "Preparing connection..." : (status === "success" ? "Upload complete" : "Uploading...")}
            </span>
            <span className="tabular-nums">
              {status === "presigning" ? "..." : `${displayProgress ?? 0}%`}
            </span>
          </div>

          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
            {status === "presigning" ? (
              // Indeterminate shimmer for presign phase
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
              />
            ) : (
              <motion.div
                className={`h-full rounded-full ${cfg.barClass}`}
                initial={{ width: 0 }}
                animate={{ width: `${displayProgress ?? 0}%` }}
                transition={{ ease: "easeOut", duration: 0.3 }}
              />
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      <AnimatePresence>
        {status === "error" && error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full text-center overflow-hidden"
          >
            <p className="text-xs text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded-xl py-2 px-3 mt-2">
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remove button at top right */}
      {onRemove && status !== "uploading" && status !== "presigning" && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onRemove}
          className="absolute top-3 right-3 w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title="Remove file"
          type="button"
        >
          <X className="w-4 h-4" />
        </motion.button>
      )}
    </motion.div>
  );
}
