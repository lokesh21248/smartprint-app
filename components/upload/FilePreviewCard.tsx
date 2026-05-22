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
  CheckCircle2,
  AlertCircle,
  Loader2,
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
      className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
    >
      {/* Main content row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* File type icon */}
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            isPdf
              ? "bg-rose-50 border border-rose-100 text-rose-500"
              : "bg-violet-50 border border-violet-100 text-violet-500"
          }`}
        >
          {isPdf ? (
            <FileText className="w-5 h-5" />
          ) : (
            <ImageIcon className="w-5 h-5" />
          )}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 text-sm truncate leading-tight">
            {file.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {formatBytes(file.size)}
            </span>
            {pageCount !== null && pageCount !== undefined && isPdf && (
              <>
                <span className="text-slate-200">·</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {pageCount} {pageCount === 1 ? "page" : "pages"}
                </span>
              </>
            )}
            {/* Status badge */}
            <span className="text-slate-200">·</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.labelClass}`}>
              {status === "uploading"
                ? `${displayProgress}%`
                : cfg.label}
            </span>
          </div>
        </div>

        {/* Right: status icon + remove button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <AnimatePresence mode="wait">
            {status === "success" && (
              <motion.div
                key="success"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="text-emerald-500"
              >
                <CheckCircle2 className="w-4 h-4" />
              </motion.div>
            )}
            {(status === "uploading" || status === "presigning") && (
              <motion.div
                key="spinner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-emerald-500"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
              </motion.div>
            )}
            {status === "error" && (
              <motion.div
                key="error"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="text-rose-500"
              >
                <AlertCircle className="w-4 h-4" />
              </motion.div>
            )}
          </AnimatePresence>

          {onRemove && status !== "uploading" && status !== "presigning" && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onRemove}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Remove file"
              type="button"
            >
              <X className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {status === "error" && error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-3 text-xs text-rose-600 font-medium">
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <AnimatePresence>
        {(status === "uploading" || status === "presigning" || status === "success") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100"
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
