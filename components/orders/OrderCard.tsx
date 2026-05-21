"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText, Phone, Clock, ChevronRight,
  Check, X, Printer, Package, CheckCircle, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import {
  formatCurrency, formatTimeAgo, formatDateTime,
  getStatusLabel, getStatusColor, getNextStatus, getNextStatusLabel,
} from "@/lib/utils";
import { useOrderStatus } from "@/lib/hooks/useOrderStatus";
import type { Order, OrderStatus } from "@/types";

interface OrderCardProps {
  order: Order;
  onStatusChange?: (orderId: string, newStatus: OrderStatus) => void;
}

export function OrderCard({ order, onStatusChange }: OrderCardProps) {
  const STATUS_ICONS: Record<OrderStatus, React.ReactNode> = {
    DRAFT: <Clock className="h-3.5 w-3.5" />,
    PLACED: <Clock className="h-3.5 w-3.5" />,
    ACCEPTED: <Check className="h-3.5 w-3.5" />,
    PRINTING: <Printer className="h-3.5 w-3.5" />,
    READY: <Package className="h-3.5 w-3.5" />,
    COMPLETED: <CheckCircle className="h-3.5 w-3.5" />,
    CANCELLED: <X className="h-3.5 w-3.5" />,
  };
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const { updateStatus, processing } = useOrderStatus(order.id, {
    onSuccess: onStatusChange ? (newStatus) => onStatusChange(order.id, newStatus) : undefined,
  });

  const currentStatus = order.order_status;
  const nextStatus = getNextStatus(currentStatus);
  const nextLabel = getNextStatusLabel(currentStatus);



  return (
    <>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 card-hover animate-fade-in">
        {/* Top row: Token + Status + Time */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#111827]">{order.short_token}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${getStatusColor(currentStatus)}`}>
                {STATUS_ICONS[currentStatus]}
                {getStatusLabel(currentStatus)}
              </span>
            </div>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {formatTimeAgo(order.created_at)} · {formatDateTime(order.created_at)}
            </p>
          </div>

          {/* Amount */}
          <div className="text-right">
            <p className="text-2xl font-black text-[#111827]">
              {formatCurrency(order.total_amount)}
            </p>
            <p className="text-xs text-[#9CA3AF]">{order.page_count} pages</p>
          </div>
        </div>

        {/* Customer info */}
        <div className="flex items-center gap-3 mb-3 p-3 bg-[#F9FAFB] rounded-xl">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2E8B57] to-[#1F4E79] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {(order.customer_name?.[0] || "G").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#374151] text-sm truncate">
              {order.customer_name || "Guest"}
            </p>
            {order.customer_phone && (
              <a
                href={`tel:${order.customer_phone}`}
                className="text-xs text-[#2E8B57] hover:underline flex items-center gap-1 mt-0.5"
                aria-label={`Call ${order.customer_name}`}
              >
                <Phone className="h-3 w-3" />
                {order.customer_phone}
              </a>
            )}
          </div>
        </div>

        {/* Print config chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
            !order.color ? "bg-gray-100 text-gray-700" : "bg-orange-50 text-orange-700"
          }`}>
            <FileText className="h-3 w-3" />
            {order.color ? "Color" : "B&W"}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-[#F3F4F6] text-[#374151]">
            {order.copies} {order.copies === 1 ? "copy" : "copies"}
          </span>
          {order.double_sided && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-[#EDE9FE] text-[#5B21B6]">
              Double-sided
            </span>
          )}
          {order.file_name && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-[#F3F4F6] text-[#374151] truncate max-w-[150px]">
              {order.file_name}
            </span>
          )}
        </div>

        {/* Special instructions / Notes */}
        {order.notes && (
          <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-[#92400E] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#92400E] font-medium">
              {order.notes}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-4">
          {/* Primary action */}
          {nextStatus && (
            <Button
              id={`action-${order.id}`}
              className="flex-1"
              disabled={processing}
              onClick={() => updateStatus(nextStatus)}
              size="default"
            >
              {nextStatus === "ACCEPTED" && <Check className="h-4 w-4" />}
              {nextStatus === "PRINTING" && <Printer className="h-4 w-4" />}
              {nextStatus === "READY" && <Package className="h-4 w-4" />}
              {nextStatus === "COMPLETED" && <CheckCircle className="h-4 w-4" />}
              {nextLabel}
            </Button>
          )}

           {/* Reject (only for placed) */}
           {currentStatus === "PLACED" && (
             <Button
               id={`reject-${order.id}`}
               variant="outline"
               className="border-[#EF4444] text-[#EF4444] hover:bg-[#FEE2E2]"
               disabled={processing}
               onClick={() => setShowRejectDialog(true)}
             >
               <X className="h-4 w-4" />
               Reject
             </Button>
           )}

          {/* Cancel (for accepted/printing) */}
          {(currentStatus === "ACCEPTED" || currentStatus === "PRINTING") && (
            <Button
              id={`cancel-${order.id}`}
              variant="outline"
              className="border-[#EF4444] text-[#EF4444] hover:bg-[#FEE2E2]"
              disabled={processing}
              onClick={() => updateStatus("CANCELLED")}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          )}

          {/* View details */}
          <Link href={`/dashboard/orders/${order.id}`}>
            <Button id={`view-${order.id}`} variant="ghost" size="icon">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Reject dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
            <DialogDescription>
              Let the customer know why you can&apos;t fulfil this order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#374151]">
                Reason (optional)
              </label>
              <textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Printer unavailable, file corrupt, out of stock…"
                rows={3}
                className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#EF4444] resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button
                id="confirm-reject-btn"
                variant="destructive"
                className="flex-1"
                disabled={processing}
                 onClick={() => updateStatus("CANCELLED", rejectReason || undefined)}
              >
                Confirm Rejection
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRejectDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
