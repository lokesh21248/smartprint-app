"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { OrderStatus } from "@/types";

interface UseOrderStatusOptions {
  onSuccess?: (newStatus: OrderStatus) => void;
}

export function useOrderStatus(orderId: string, options?: UseOrderStatusOptions) {
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);

  const updateStatus = async (newStatus: OrderStatus, reason?: string) => {
    if (processing) return; // Prevent duplicate clicks
    setProcessing(true);

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

        // Reconcile client state with actual database state
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["new-orders"] });
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

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["new-orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

      options?.onSuccess?.(newStatus);
    } catch {
      toast.error("Network error. Please check your connection and try again.");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["new-orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } finally {
      setProcessing(false);
    }
  };

  return { updateStatus, processing };
}