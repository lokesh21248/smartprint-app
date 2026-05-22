"use client";

/**
 * UploadProgressBar.tsx
 *
 * Animated multi-phase progress bar for the order submission flow.
 *
 * Phases:
 *   compressing (0-15%)  → "Optimizing file..."
 *   uploading   (15-85%) → "Uploading file... X%"
 *   saving      (85-95%) → "Saving your order..."
 *   success     (100%)   → "Order placed!" + checkmark
 *
 * The `uploadPercent` prop drives the upload phase (0–100 from XHR onprogress).
 * The `phase` prop switches between phases.
 */

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";

export type UploadPhase = "idle" | "compressing" | "uploading" | "saving" | "success";

interface UploadProgressBarProps {
  phase: UploadPhase;
  /** 0–100, only meaningful during 'uploading' phase */
  uploadPercent: number;
}

// Maps phase to overall bar fill percentage
function getOverallPercent(phase: UploadPhase, uploadPercent: number): number {
  switch (phase) {
    case "idle":        return 0;
    case "compressing": return 8;
    case "uploading":   return 15 + (uploadPercent * 0.7); // 15→85%
    case "saving":      return 90;
    case "success":     return 100;
    default:            return 0;
  }
}

function getLabel(phase: UploadPhase, uploadPercent: number): string {
  switch (phase) {
    case "compressing": return "Optimizing file for mobile…";
    case "uploading":   return `Uploading… ${Math.round(uploadPercent)}%`;
    case "saving":      return "Saving your order…";
    case "success":     return "Order placed!";
    default:            return "";
  }
}

export function UploadProgressBar({ phase, uploadPercent }: UploadProgressBarProps) {
  const percent = getOverallPercent(phase, uploadPercent);
  const label = getLabel(phase, uploadPercent);
  const isSuccess = phase === "success";

  return (
    <AnimatePresence>
      {phase !== "idle" && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="w-full space-y-2"
        >
          {/* Label row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 text-emerald-500 animate-spin shrink-0" />
              )}
              <span
                className={`text-xs font-bold transition-colors ${
                  isSuccess ? "text-emerald-600" : "text-slate-600"
                }`}
              >
                {label}
              </span>
            </div>
            <span className="text-[10px] font-black text-slate-400 tabular-nums">
              {Math.round(percent)}%
            </span>
          </div>

          {/* Progress track */}
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                isSuccess
                  ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                  : "bg-gradient-to-r from-emerald-500 to-teal-400"
              }`}
              initial={{ width: "0%" }}
              animate={{ width: `${percent}%` }}
              transition={{
                duration: isSuccess ? 0.4 : 0.6,
                ease: isSuccess ? "easeOut" : "linear",
              }}
            />
          </div>

          {/* Success pulse ring */}
          {isSuccess && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0.6 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="absolute inset-0 rounded-full border-2 border-emerald-400 pointer-events-none"
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
