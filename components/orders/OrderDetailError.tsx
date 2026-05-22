"use client";

/**
 * OrderDetailError.tsx
 *
 * Shown instead of the raw Next.js 404/500 page when an order detail
 * page can't be loaded. Covers three distinct cases:
 *  - Order not found (invalid ID, deleted, wrong env)
 *  - Unauthorized (order belongs to another shop owner)
 *  - DB/network error (transient, show refresh button)
 */

import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldX, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderDetailErrorProps {
  title: string;
  message: string;
  backHref?: string;
  showRefresh?: boolean;
}

export function OrderDetailError({
  title,
  message,
  backHref = "/dashboard/orders",
  showRefresh = false,
}: OrderDetailErrorProps) {
  const Icon = title.includes("Access") ? ShieldX : FileSearch;

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-900/[0.03] p-10 max-w-md w-full space-y-6">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto">
          <Icon className="w-8 h-8 text-slate-400" />
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h1 className="text-xl font-black text-slate-900 tracking-tight">{title}</h1>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {showRefresh && (
            <Button
              onClick={() => window.location.reload()}
              className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Refresh Page
            </Button>
          )}
          <Link href={backHref}>
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-slate-200 font-bold gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Orders
            </Button>
          </Link>
        </div>

        {/* Debug hint (only shows in dev) */}
        {process.env.NODE_ENV === "development" && (
          <p className="text-[10px] text-slate-300 font-mono">
            {typeof window !== "undefined" ? window.location.pathname : ""}
          </p>
        )}
      </div>
    </div>
  );
}
