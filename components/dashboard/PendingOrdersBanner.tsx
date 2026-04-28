"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useOrderStore } from "@/stores/orderStore";

interface PendingOrdersBannerProps {
  count: number;
}

export function PendingOrdersBanner({ count: initialCount }: PendingOrdersBannerProps) {
  const { pendingCount } = useOrderStore();
  // Use the store value if it's been updated by realtime, otherwise use server-rendered value
  const count = pendingCount > 0 ? pendingCount : initialCount;

  if (count === 0) return null;

  return (
    <div
      id="pending-orders-banner"
      className="relative overflow-hidden bg-gradient-to-r from-[#B91C1C] to-[#EF4444] text-white rounded-2xl p-5 flex items-center justify-between gap-4"
    >
      {/* Animated background rings */}
      <div className="absolute -left-4 -top-4 w-24 h-24 rounded-full bg-white/10 animate-ping" style={{ animationDuration: "2s" }} />
      <div className="absolute -right-4 -bottom-4 w-32 h-32 rounded-full bg-white/5" />

      <div className="relative flex items-center gap-4">
        {/* Big pulsing number */}
        <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center animate-pulse-ring">
          <span className="text-3xl font-black">{count}</span>
        </div>
        <div>
          <p className="text-xl font-bold">
            {count === 1 ? "New Order Waiting!" : `${count} New Orders Waiting!`}
          </p>
          <p className="text-red-100 text-sm mt-0.5 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Customers are waiting — accept orders quickly
          </p>
        </div>
      </div>

      <Link href="/orders" className="relative flex-shrink-0">
        <Button
          id="view-pending-btn"
          className="bg-white text-[#B91C1C] hover:bg-red-50 font-bold shadow-lg"
          size="lg"
        >
          View Orders →
        </Button>
      </Link>
    </div>
  );
}
