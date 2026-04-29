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
    setProcessing(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus, rejectionReason: reason }),
      });

      if (!res.ok) throw new Error("Failed");

      const successMessage =
        newStatus === "ACCEPTED" ? "✅ Order accepted!" :
        newStatus === "PRINTING" ? "🖨️ Started printing" :
        newStatus === "READY" ? "📦 Marked as ready" :
        newStatus === "COMPLETED" ? "✅ Order completed!" :
        "Order updated";

      toast.success(successMessage);

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["new-orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

      options?.onSuccess?.(newStatus);
    } catch {
      toast.error("Action failed. Please try again.");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } finally {
      setProcessing(false);
    }
  };

  return { updateStatus, processing };
}