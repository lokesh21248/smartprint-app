"use client";

/**
 * error.tsx — Error boundary for the order detail route segment.
 *
 * Catches runtime errors thrown during rendering of page.tsx or its children.
 * Without this, errors bubble up to the nearest parent error boundary
 * (usually the dashboard layout) which shows a full-page crash.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function OrderDetailErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error("[OrderDetailPage] render error:", error.message, error.digest);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-900/[0.03] p-10 max-w-md w-full space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            Failed to load order
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Something went wrong while fetching this order. This is usually a temporary issue.
          </p>
          {error.digest && (
            <p className="text-[10px] text-slate-300 font-mono">ref: {error.digest}</p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={reset}
            className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </Button>
          <Link href="/orders">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-slate-200 font-bold gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Orders
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
