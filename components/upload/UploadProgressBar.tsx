"use client";

/**
 * UploadProgressBar.tsx
 *
 * Animated multi-phase progress bar for the order submission flow.
 *
 * Phases:
 *   uploading   (0–85%)  → "Uploading N files… X%"   with shimmer
 *   saving      (85–95%) → "Saving your order…"
 *   success     (100%)   → "Order placed!" + checkmark pulse
 */

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Upload, Database } from "lucide-react";

export type UploadPhase = "idle" | "compressing" | "uploading" | "saving" | "success";

interface UploadProgressBarProps {
  phase: UploadPhase;
  /** 0–100, drives the uploading phase bar fill */
  uploadPercent: number;
  /** Number of files being uploaded — shown in label */
  fileCount?: number;
}

// Maps phase to overall fill %
function getOverallPercent(phase: UploadPhase, uploadPercent: number): number {
  switch (phase) {
    case "idle":        return 0;
    case "compressing": return 8;
    case "uploading":   return 10 + uploadPercent * 0.75; // 10→85%
    case "saving":      return 90;
    case "success":     return 100;
    default:            return 0;
  }
}

export function UploadProgressBar({
  phase,
  uploadPercent,
  fileCount = 1,
}: UploadProgressBarProps) {
  const percent = getOverallPercent(phase, uploadPercent);
  const isSuccess = phase === "success";
  const isSaving = phase === "saving";
  const isUploading = phase === "uploading" || phase === "compressing";

  return (
    <AnimatePresence>
      {phase !== "idle" && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="w-full space-y-3"
        >
          {/* Label row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {isSuccess ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                </motion.div>
              ) : isSaving ? (
                <Database className="w-4 h-4 text-emerald-500 animate-pulse shrink-0" />
              ) : isUploading ? (
                <Upload className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 text-emerald-500 animate-spin shrink-0" />
              )}

              <span
                className={`text-xs font-bold truncate transition-colors ${
                  isSuccess ? "text-emerald-600" : "text-slate-700"
                }`}
              >
                {phase === "compressing" && "Optimizing files for upload…"}
                {phase === "uploading" &&
                  `Uploading ${fileCount} file${fileCount !== 1 ? "s" : ""}…`}
                {phase === "saving" && "Saving your order…"}
                {phase === "success" && "Order placed successfully!"}
              </span>
            </div>

            {/* Percentage pill */}
            <span
              className={`text-[10px] font-black tabular-nums shrink-0 px-2 py-0.5 rounded-full ${
                isSuccess
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {Math.round(percent)}%
            </span>
          </div>

          {/* Progress track */}
          <div className="relative h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                isSuccess
                  ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                  : isSaving
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                  : "bg-gradient-to-r from-emerald-500 to-emerald-400"
              }`}
              initial={{ width: "0%" }}
              animate={{ width: `${percent}%` }}
              transition={{
                duration: isSuccess ? 0.4 : 0.7,
                ease: isSuccess ? "easeOut" : [0.25, 0.46, 0.45, 0.94],
              }}
            />

            {/* Shimmer overlay during active upload */}
            {isUploading && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                animate={{ x: ["-100%", "200%"] }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: "linear",
                  repeatDelay: 0.3,
                }}
              />
            )}
          </div>

          {/* Sub-label */}
          <AnimatePresence mode="wait">
            {phase === "uploading" && (
              <motion.p
                key="uploading-sub"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[10px] text-slate-400 font-bold"
              >
                {uploadPercent < 30
                  ? "Starting upload…"
                  : uploadPercent < 70
                  ? "Transferring…"
                  : uploadPercent < 95
                  ? "Almost there…"
                  : "Finalizing…"}
              </motion.p>
            )}
            {phase === "saving" && (
              <motion.p
                key="saving-sub"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[10px] text-slate-400 font-bold"
              >
                Creating your order record…
              </motion.p>
            )}
            {phase === "success" && (
              <motion.p
                key="success-sub"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[10px] text-emerald-600 font-bold"
              >
                Redirecting to order status…
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
