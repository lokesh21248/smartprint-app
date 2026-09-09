"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrderStore } from "@/stores/orderStore";
import type { Order, OrderStatus } from "@/types";

interface UseOrderStatusOptions {
  onSuccess?: (newStatus: OrderStatus) => void;
}

// ─── Order-counts cache shape ─────────────────────────────────────────────────
// Must match the shape returned by /api/shop/order-counts and injected in page.tsx.
type OrderCountsCache = {
  total: number;
  placed: number;
  accepted: number;
  printing: number;
  ready: number;
  completed: number;
  cancelled: number;
};

function statusToBucket(status: string): keyof OrderCountsCache | null {
  const s = String(status ?? "").trim().toUpperCase();
  if (s === "PLACED" || s === "NEW") return "placed";
  if (s === "ACCEPTED") return "accepted";
  if (s === "PRINTING") return "printing";
  if (s === "READY") return "ready";
  if (s === "COMPLETED" || s === "SUCCESS") return "completed";
  if (s === "CANCELLED" || s === "REJECTED") return "cancelled";
  return null;
}

export function useOrderStatus(orderId: string, options?: UseOrderStatusOptions) {
  const queryClient = useQueryClient();
  const updateOrderInStore = useOrderStore((s) => s.updateOrder);
  const [processing, setProcessing] = useState(false);

  const updateStatus = async (newStatus: OrderStatus, reason?: string) => {
    if (processing) return; // Prevent duplicate clicks
    setProcessing(true);

    // ── 1. Snapshot current state for rollback ─────────────────────────────────
    // We optimistically update all caches immediately, then rollback if the DB
    // PATCH fails. This gives instant UI response without waiting for the API.
    const previousOrdersData = queryClient.getQueryData<Order[]>(["orders"]);

    // Find the current order to capture its old status (needed for count rollback)
    let oldStatus: OrderStatus | null = null;
    const allOrderCacheKeys = queryClient.getQueriesData<Order[]>({ queryKey: ["orders"] });
    for (const [, orders] of allOrderCacheKeys) {
      const found = orders?.find((o) => o.id === orderId);
      if (found) {
        oldStatus = found.order_status;
        break;
      }
    }

    // ── 2. Optimistic update — orders cache ───────────────────────────────────
    // Update all ["orders", shopId] query cache entries in-memory.
    // Realtime will confirm/reconcile; rollback path handles errors.
    queryClient.setQueriesData<Order[]>({ queryKey: ["orders"] }, (prev) =>
      (prev ?? []).map((o) =>
        o.id === orderId ? { ...o, order_status: newStatus } : o
      )
    );

    // Also update Zustand store immediately (drives the UI badge + sort)
    updateOrderInStore(orderId, { order_status: newStatus });

    // ── 3. Optimistic update — order-counts cache ─────────────────────────────
    // Capture snapshot of counts for rollback.
    let countsSnapshot: OrderCountsCache | null = null;
    // Apply delta to all ["order-counts", shopId] entries
    const allCountCacheKeys = queryClient.getQueriesData<OrderCountsCache>({ queryKey: ["order-counts"] });
    for (const [key, counts] of allCountCacheKeys) {
      if (!counts) continue;
      countsSnapshot = counts; // capture for rollback
      const oldBucket = oldStatus ? statusToBucket(oldStatus) : null;
      const newBucket = statusToBucket(newStatus);
      queryClient.setQueryData<OrderCountsCache>(key, {
        ...counts,
        ...(oldBucket ? { [oldBucket]: Math.max(0, (counts[oldBucket] as number) - 1) } : {}),
        ...(newBucket ? { [newBucket]: Math.max(0, (counts[newBucket] as number) + 1) } : {}),
      });
    }

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus: newStatus.toLowerCase(), rejectionReason: reason }),
      });

      if (!res.ok) {
        let serverError = "Action failed. Please try again.";
        try {
          const body = await res.json();
          if (body?.error && typeof body.error === "string") {
            if (res.status === 400) {
              serverError = body.error;
            } else if (res.status === 401) {
              serverError = "Session expired. Please log in again.";
            } else if (res.status === 403) {
              serverError = "You do not have permission to update this order.";
            } else if (res.status === 404) {
              serverError = "Order not found. It may have been removed.";
            } else if (res.status === 409) {
              serverError = body.error || "Order status conflict. Refreshing orders...";
            } else if (res.status === 422) {
              serverError = body.error;
            } else if (res.status === 429) {
              serverError = "Too many requests. Please wait a moment.";
            } else {
              serverError = body.error || "Could not update order status.";
            }
          }
        } catch {
          if (res.status === 0 || res.type === "error") {
            serverError = "Network error. Please check your connection.";
          }
        }

        toast.error(serverError);

        // ── Rollback optimistic updates ──────────────────────────────────────
        // Restore orders cache from snapshot (full refetch is the safest rollback)
        if (previousOrdersData !== undefined) {
          queryClient.setQueriesData<Order[]>({ queryKey: ["orders"] }, previousOrdersData);
        }
        // Restore Zustand store to old status
        if (oldStatus) {
          updateOrderInStore(orderId, { order_status: oldStatus });
        }
        // Restore counts snapshot
        if (countsSnapshot) {
          for (const [key] of allCountCacheKeys) {
            queryClient.setQueryData<OrderCountsCache>(key, countsSnapshot);
          }
        }
        // Trigger a reconciliation refetch to sync with DB truth
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["order-counts"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        return;
      }

      const successMessage =
        newStatus === "ACCEPTED"
          ? "✅ Order accepted!"
          : newStatus === "PRINTING"
          ? "🖨️ Started printing"
          : newStatus === "READY"
          ? "📦 Marked as ready"
          : newStatus === "COMPLETED"
          ? "✅ Order completed!"
          : newStatus === "CANCELLED"
          ? "Order cancelled."
          : "Order updated";

      toast.success(successMessage);

      // ── On success: do NOT invalidate orders/order-counts ────────────────────
      // The optimistic update is already applied. The Realtime event from Supabase
      // will arrive shortly and act as the authoritative reconciler.
      // We only invalidate dashboard-stats (a different query unrelated to counts).
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

      options?.onSuccess?.(newStatus);
    } catch {
      toast.error("Network error. Please check your connection and try again.");

      // ── Rollback on network error ────────────────────────────────────────────
      if (previousOrdersData !== undefined) {
        queryClient.setQueriesData<Order[]>({ queryKey: ["orders"] }, previousOrdersData);
      }
      if (oldStatus) {
        updateOrderInStore(orderId, { order_status: oldStatus });
      }
      if (countsSnapshot) {
        for (const [key] of allCountCacheKeys) {
          queryClient.setQueryData<OrderCountsCache>(key, countsSnapshot);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-counts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } finally {
      setProcessing(false);
    }
  };

  return { updateStatus, processing };
}