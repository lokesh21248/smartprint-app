"use client";

import { useState, memo, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrderCardSkeleton } from "@/components/ui/skeleton";
import { useOrderStore } from "@/stores/orderStore";
import { useShopStore } from "@/stores/shopStore";
import { toast } from "sonner";
import { TimeAgo } from "./TimeAgo";
import { FileText, Phone, Check, X, Printer, ShieldAlert, ShieldCheck, Clock } from "lucide-react";
import Link from "next/link";
import type { Order } from "@/types";

type ScanStatus = "pending" | "scanning" | "clean" | "infected" | "failed" | null;

const ScanStatusBadge = memo(function ScanStatusBadge({ status }: { status: ScanStatus }) {
  if (!status || status === "clean") return null;

  if (status === "infected") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-semibold mt-1.5">
        <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>⚠️ File Quarantined — Malicious content detected</span>
      </div>
    );
  }

  if (status === "scanning") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold mt-1.5">
        <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 animate-pulse" aria-hidden="true" />
        <span>Scanning file…</span>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-xs font-medium mt-1.5">
        <Clock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>Scan pending</span>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-orange-600 text-xs font-medium mt-1.5">
        <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>Scan failed — will retry</span>
      </div>
    );
  }

  return null;
});

interface NewOrdersFeedProps {
  initialOrders: Order[];
  shopId: string;
}

export function NewOrdersFeed({ initialOrders, shopId }: NewOrdersFeedProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const storeOrders = useOrderStore((s) => s.orders);
  const isHydrated = useOrderStore((s) => s.isHydrated);
  const updateOrder = useOrderStore((s) => s.updateOrder);
  const { clearNotifications } = useShopStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Derive new/placed orders from the centralized global store + server initialOrders
  const orders = useMemo(() => {
    // We want the most up-to-date data.
    // storeOrders might contain new realtime events, while initialOrders contains server data.
    // By merging them, we ensure we don't lose initialOrders if storeOrders was cleared,
    // while still prioritizing any fresh updates from storeOrders.
    const mergedMap = new Map(initialOrders.map(o => [o.id, o]));
    
    if (mounted && storeOrders.length > 0) {
      storeOrders.forEach(o => mergedMap.set(o.id, o));
    }
    
    return Array.from(mergedMap.values())
      .filter((o) => o.order_status?.toUpperCase() === "PLACED")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [mounted, storeOrders, initialOrders]);

  const handleAction = async (
    orderId: string,
    newStatus: "accepted" | "cancelled"
  ) => {
    setProcessing((p) => ({ ...p, [orderId]: true }));

    const updatedStatus = newStatus === "accepted" ? "ACCEPTED" : "CANCELLED";

    // 1. Instant optimistic update in global order store
    updateOrder(orderId, { order_status: updatedStatus });
    clearNotifications();

    // 2. Instant optimistic update in React Query cache
    queryClient.setQueryData<Order[]>(["new-orders", shopId], (prev) =>
      (prev ?? []).filter((o) => o.id !== orderId)
    );
    queryClient.setQueryData<Order[]>(["orders", shopId], (prev) =>
      (prev ?? []).map((o) => (o.id === orderId ? { ...o, order_status: updatedStatus } : o))
    );

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStatus,
          rejectionReason: newStatus === "cancelled" ? "Rejected by shop" : undefined,
        }),
      });
      if (!res.ok) {
        let errorMsg = "Action failed. Please try again.";
        try {
          const body = await res.json();
          if (body?.error && typeof body.error === "string") {
            errorMsg = body.error;
          }
        } catch {}
        throw new Error(errorMsg);
      }
      toast.success(
        newStatus === "accepted" ? "✅ Order accepted!" : "Order rejected"
      );
      queryClient.invalidateQueries({ queryKey: ["orders", shopId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", shopId] });
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ["new-orders", shopId] });
      queryClient.invalidateQueries({ queryKey: ["orders", shopId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", shopId] });
      const message = err instanceof Error ? err.message : "Action failed. Please try again.";
      toast.error(message);
    } finally {
      setProcessing((p) => ({ ...p, [orderId]: false }));
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-[#F3F4F6]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] animate-pulse" />
          <h2 className="text-lg font-bold text-[#111827]">New Orders</h2>
          {orders && orders.length > 0 && (
            <Badge variant="destructive">{orders.length}</Badge>
          )}
        </div>
        <Link
          href="/dashboard/orders"
          className="text-sm text-[#2E8B57] font-medium hover:text-[#1F6B42] transition-colors"
        >
          View All →
        </Link>
      </div>

      {/* Body */}
      <div className="divide-y divide-[#F3F4F6]">
        {!orders || orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-[#F3F4F6] flex items-center justify-center mb-3">
              <Printer className="h-7 w-7 text-[#9CA3AF]" />
            </div>
            <p className="font-semibold text-[#374151]">All caught up!</p>
            <p className="text-sm text-[#9CA3AF] mt-1">No new orders right now.</p>
          </div>
        ) : (
          orders.slice(0, 5).map((order) => (
            <div key={order.id} className="p-4 hover:bg-[#FAFAFA] transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Order number + time */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-[#111827] text-sm">
                      Order #{order.short_token}
                    </span>
                    <span className="text-xs text-[#9CA3AF]">
                      <TimeAgo date={order.created_at} />
                    </span>
                  </div>

                  {/* Customer */}
                  <p className="text-sm font-medium text-[#374151] mb-1">
                    {order.customer_name || "Guest"}
                    {order.customer_phone && (
                      <a
                        href={`tel:${order.customer_phone}`}
                        className="ml-2 inline-flex items-center gap-1 text-[#2E8B57] text-xs font-normal hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {order.customer_phone}
                      </a>
                    )}
                  </p>

                  {/* Config */}
                  <p className="text-xs text-[#6B7280] mb-1">
                    <FileText className="h-3 w-3 inline mr-1" />
                    {order.files && order.files.length > 0
                      ? `${order.files.length} file${order.files.length > 1 ? "s" : ""} · mixed config`
                      : `1 file · ${order.page_count}pg x ${order.copies} copies (${order.color ? "Color" : "B&W"})`}
                  </p>

                  {/* Scan status badge */}
                  <ScanStatusBadge
                    status={(order as Order & { file_scan_status?: ScanStatus }).file_scan_status ?? null}
                  />

                  {/* Special instructions */}
                  {order.notes && (
                    <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-lg px-2.5 py-1.5 mb-2">
                      <p className="text-xs text-[#92400E] font-medium">
                        ⚠️ {order.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div className="text-right flex-shrink-0">
                  <p className="text-xl font-black text-[#111827]">
                    {formatCurrency(order.total_amount)}
                  </p>
                  <p className="text-xs text-[#9CA3AF]">
                    {order.files && order.files.length > 0 
                      ? `${order.files.reduce((acc, f) => acc + (f.pages * (f.copies || 1)), 0)} total pages`
                      : `${order.page_count * order.copies} total pages`}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                {(order as Order & { file_scan_status?: ScanStatus }).file_scan_status !== "infected" && (
                  <Button
                    id={`accept-${order.id}`}
                    size="sm"
                    className="flex-1"
                    loading={processing[order.id]}
                    onClick={() => handleAction(order.id, "accepted")}
                  >
                    <Check className="h-4 w-4" />
                    Accept
                  </Button>
                )}
                <Button
                  id={`reject-${order.id}`}
                  size="sm"
                  variant="outline"
                  className="flex-1 border-[#EF4444] text-[#EF4444] hover:bg-[#FEE2E2]"
                  loading={processing[order.id]}
                  onClick={() => handleAction(order.id, "cancelled")}
                >
                  <X className="h-4 w-4" />
                  {(order as Order & { file_scan_status?: ScanStatus }).file_scan_status === "infected" ? "Dismiss" : "Reject"}
                </Button>
                <Link href={`/dashboard/orders/${order.id}`}>
                  <Button size="sm" variant="ghost" className="px-3">
                    View
                  </Button>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
