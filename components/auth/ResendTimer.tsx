"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResendTimerProps {
  onResend: () => Promise<void>;
  initialSeconds?: number;
  /** Call this to restart the timer (e.g., after successful send) */
  resetKey?: number;
}

export function ResendTimer({
  onResend,
  initialSeconds = 60,
  resetKey = 0,
}: ResendTimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [resending, setResending] = useState(false);

  // Reset timer whenever resetKey changes (new OTP sent)
  useEffect(() => {
    setSeconds(initialSeconds);
  }, [resetKey, initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  const handleResend = useCallback(async () => {
    if (seconds > 0 || resending) return;
    setResending(true);
    try {
      await onResend();
      setSeconds(initialSeconds);
    } finally {
      setResending(false);
    }
  }, [seconds, resending, onResend, initialSeconds]);

  const canResend = seconds === 0 && !resending;

  return (
    <div className="flex items-center justify-center gap-1.5 text-sm">
      <span className="text-[#6B7280]">Didn&apos;t receive the code?</span>
      {seconds > 0 ? (
        <span className="text-[#9CA3AF] tabular-nums">
          Resend in{" "}
          <span className="font-semibold text-[#2E8B57]">
            0:{String(seconds).padStart(2, "0")}
          </span>
        </span>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={!canResend}
          className={cn(
            "inline-flex items-center gap-1.5 font-semibold transition-all duration-150",
            "text-[#2E8B57] hover:text-[#1F6B42] hover:underline",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
          )}
          aria-label="Resend OTP code"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", resending && "animate-spin")}
          />
          {resending ? "Sending…" : "Resend code"}
        </button>
      )}
    </div>
  );
}
