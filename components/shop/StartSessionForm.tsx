"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface StartSessionFormProps {
  shopSlug: string;
}

export function StartSessionForm({ shopSlug }: StartSessionFormProps) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [isStartingSession, setIsStartingSession] = useState(false);

  const handleStartSession = async () => {
    const trimmedName = customerName.trim();
    if (trimmedName.length < 3) {
      toast.error("Please enter your name (at least 3 characters).");
      return;
    }
    setIsStartingSession(true);

    // 1. Offline check
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("You appear to be offline. Please check your connection and try again.");
      setIsStartingSession(false);
      return;
    }

    // 2. Timeout helper
    const attemptSession = async (timeoutMs: number): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_name: trimmedName, shop_slug: shopSlug }),
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
        });
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // 3. Error mapper
    const getErrorMsg = (status: number, data: { error?: string }): string => {
      if (status === 429) return "Too many requests. Please wait a moment and try again.";
      if (status === 503) return "Service temporarily unavailable. Please try again in a few seconds.";
      if (status === 400) return data.error || "Invalid details. Please check and try again.";
      if (status >= 500) return "Server error. We're retrying…";
      return data.error || "Could not start your session. Please try again.";
    };

    try {
      let res: Response;

      // 4. Attempt 1
      try {
        res = await attemptSession(25000);
      } catch (firstErr) {
        console.error("[ORDER FLOW ERROR] First attempt failed:", firstErr);
        try {
          await new Promise((r) => setTimeout(r, 1500));
          res = await attemptSession(20000);
        } catch (retryErr) {
          console.error("[ORDER FLOW ERROR] Retry also failed:", retryErr);
          const isTimeout = retryErr instanceof Error && retryErr.name === "AbortError";
          toast.error(
            isTimeout
              ? "Request timed out. Please check your connection and try again."
              : "Connection failed. Please check your network and try again."
          );
          setIsStartingSession(false);
          return;
        }
      }

      // 5. Retry on 5xx
      if (res.status >= 500) {
        try {
          await new Promise((r) => setTimeout(r, 2000));
          res = await attemptSession(20000);
        } catch (retryErr) {
          console.error("[ORDER FLOW ERROR] 5xx retry network failed:", retryErr);
          toast.error("Server error. Please try again in a moment.");
          setIsStartingSession(false);
          return;
        }
      }

      // 6. JSON Parse
      let data: { success?: boolean; sessionId?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        toast.error("Unexpected server response. Please try again.");
        setIsStartingSession(false);
        return;
      }

      // 7. Redirect success
      if (res.ok && data.success && data.sessionId) {
        try {
          localStorage.removeItem("latestPlacedOrder");
        } catch (e) {
          console.warn("localStorage not available:", e);
        }
        router.push(
          `/order-upload?shopSlug=${shopSlug}&sessionId=${data.sessionId}&name=${encodeURIComponent(trimmedName)}`
        );
        return;
      }

      // 8. API Level Error
      toast.error(getErrorMsg(res.status, data));
      setIsStartingSession(false);
    } catch (err) {
      console.error("[ORDER FLOW ERROR] Unhandled exception:", err);
      toast.error("Something went wrong. Please try again.");
      setIsStartingSession(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <Input
          placeholder="Enter your full name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="h-16 rounded-2xl border-slate-100 bg-slate-50 text-slate-800 text-lg font-semibold focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 px-6 transition-all duration-300 shadow-inner placeholder:text-slate-400 font-medium"
        />
      </div>

      <Button
        onClick={handleStartSession}
        disabled={isStartingSession || customerName.trim().length < 3}
        className="w-full h-16 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-lg shadow-xl shadow-emerald-500/10 transition-all duration-300 flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none"
      >
        {isStartingSession ? (
          <>
            <Loader2 className="animate-spin w-5 h-5" /> Starting session...
          </>
        ) : (
          <>
            Start Printing <ArrowRight className="w-5 h-5" />
          </>
        )}
      </Button>

      {/* Secure indicator */}
      <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold pt-2 border-t border-slate-50">
        <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
        <span>End-to-End Secure Processing</span>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
        <span>GDPR Guarded</span>
      </div>
    </div>
  );
}
