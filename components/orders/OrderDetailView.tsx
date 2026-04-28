"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, FileText, Phone, Download, Printer, Clock,
  Check, Package, CheckCircle, X, AlertTriangle, IndianRupee,
  User, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatCurrency, formatDateTime, formatTimeAgo, formatFileSize,
  getStatusColor, getStatusLabel, getNextStatus, getNextStatusLabel,
} from "@/lib/utils";
import type { Order, OrderStatus } from "@/types";

interface OrderDetailViewProps {
  order: Order;
}

const STATUS_STEPS: OrderStatus[] = ["placed", "accepted", "printing", "ready", "completed"];

export function OrderDetailView({ order: initialOrder }: OrderDetailViewProps) {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState(initialOrder);
  const [processing, setProcessing] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [activeFile, setActiveFile] = useState(0);

  const nextStatus = getNextStatus(order.status);

  const handleAction = async (newStatus: OrderStatus, reason?: string) => {
    setProcessing(true);
    setOrder((o) => ({ ...o, status: newStatus })); // optimistic

    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error("Failed");

      toast.success(
        newStatus === "completed" ? "🎉 Order completed!" : "Status updated"
      );
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch {
      setOrder(initialOrder);
      toast.error("Update failed. Please try again.");
    } finally {
      setProcessing(false);
      setShowRejectDialog(false);
    }
  };

  const currentStep = STATUS_STEPS.indexOf(order.status);

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <Link href="/orders">
          <Button variant="ghost" size="icon-sm" aria-label="Back to orders">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">{order.order_number}</h1>
          <p className="text-sm text-[#6B7280]">
            Placed {formatTimeAgo(order.created_at)}
          </p>
        </div>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold border ${getStatusColor(order.status)}`}>
          {getStatusLabel(order.status)}
        </span>
      </div>

      {/* Status Timeline */}
      {!["cancelled", "rejected"].includes(order.status) && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
          <h2 className="font-semibold text-[#111827] mb-4 text-sm uppercase tracking-wide">
            Order Progress
          </h2>
          <div className="flex items-center">
            {STATUS_STEPS.map((step, i) => {
              const done = i <= currentStep;
              const active = i === currentStep;
              return (
                <div key={step} className="flex-1 flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                        done
                          ? "bg-[#2E8B57] border-[#2E8B57] text-white"
                          : "bg-white border-[#E5E7EB] text-[#9CA3AF]"
                      } ${active ? "animate-pulse-green" : ""}`}
                    >
                      {done && i < currentStep ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={`text-[10px] mt-1 font-medium text-center max-w-[60px] ${done ? "text-[#2E8B57]" : "text-[#9CA3AF]"}`}>
                      {getStatusLabel(step)}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 transition-all ${
                        i < currentStep ? "bg-[#2E8B57]" : "bg-[#E5E7EB]"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="font-bold text-[#111827] mb-3 flex items-center gap-2">
              <User className="h-4 w-4" /> Customer
            </h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2E8B57] to-[#1F4E79] flex items-center justify-center text-white font-bold">
                {(order.customer?.user_metadata?.name?.[0] ?? "C").toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-[#374151]">
                  {order.customer_name ?? order.customer?.user_metadata?.name ?? "Guest"}
                </p>
                <p className="text-sm text-[#6B7280]">
                  {order.customer?.email ?? "—"}
                </p>
                {(order.customer_phone || order.customer?.user_metadata?.phone) && (
                  <a
                    href={`tel:${order.customer_phone || order.customer?.user_metadata?.phone}`}
                    className="text-sm text-[#2E8B57] hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {order.customer_phone || order.customer?.user_metadata?.phone}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Print Config */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="font-bold text-[#111827] mb-3 flex items-center gap-2">
              <Printer className="h-4 w-4" /> Print Settings
            </h2>
            <div className="space-y-2 text-sm">
              {[
                ["Type", order.print_config.color === "bw" ? "Black & White" : "Color"],
                ["Size", order.print_config.size],
                ["Copies", order.print_config.copies.toString()],
                ["Sides", order.print_config.duplex ? "Double-sided" : "Single-sided"],
                ["Binding", order.print_config.binding === "none" ? "No binding" : `${order.print_config.binding} binding`],
                ["Total Pages", order.total_pages.toString()],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-[#F3F4F6] last:border-0">
                  <span className="text-[#6B7280]">{label}</span>
                  <span className="font-medium text-[#111827]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="font-bold text-[#111827] mb-3 flex items-center gap-2">
              <IndianRupee className="h-4 w-4" /> Order Amount
            </h2>
            <p className="text-4xl font-black text-[#111827]">
              {formatCurrency(order.total_amount)}
            </p>
            {order.estimated_completion && (
              <p className="text-sm text-[#6B7280] mt-2 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Est. ready: {formatDateTime(order.estimated_completion)}
              </p>
            )}
          </div>

          {/* Special Instructions */}
          {order.special_instructions && (
            <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="h-4 w-4 text-[#92400E]" />
                <h2 className="font-bold text-[#92400E] text-sm">Special Instructions</h2>
              </div>
              <p className="text-sm text-[#92400E]">{order.special_instructions}</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {nextStatus && (
              <Button
                id={`detail-action-${order.id}`}
                className="w-full"
                size="lg"
                loading={processing}
                onClick={() => handleAction(nextStatus)}
              >
                {nextStatus === "accepted" && <Check className="h-5 w-5" />}
                {nextStatus === "printing" && <Printer className="h-5 w-5" />}
                {nextStatus === "ready" && <Package className="h-5 w-5" />}
                {nextStatus === "completed" && <CheckCircle className="h-5 w-5" />}
                {getNextStatusLabel(order.status)}
              </Button>
            )}
            {order.status === "placed" && (
              <Button
                id={`detail-reject-${order.id}`}
                variant="outline"
                className="w-full border-[#EF4444] text-[#EF4444] hover:bg-[#FEE2E2]"
                onClick={() => setShowRejectDialog(true)}
              >
                <X className="h-4 w-4" /> Reject Order
              </Button>
            )}
          </div>
        </div>

        {/* Right: File Preview */}
        <div className="lg:col-span-3 space-y-4">
          {/* File list */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="font-bold text-[#111827] mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Files ({order.files.length})
            </h2>
            <div className="space-y-2">
              {order.files.map((file, i) => (
                <button
                  key={i}
                  onClick={() => setActiveFile(i)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    activeFile === i
                      ? "border-[#2E8B57] bg-[#E8F5EE]"
                      : "border-[#E5E7EB] hover:bg-[#F9FAFB]"
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#374151] truncate">{file.name}</p>
                    <p className="text-xs text-[#9CA3AF]">
                      {formatFileSize(file.size)} · {file.pages} pages
                    </p>
                  </div>
                  <a
                    href={file.url}
                    download={file.name}
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-lg hover:bg-[#E5E7EB] text-[#6B7280] transition-colors"
                    aria-label={`Download ${file.name}`}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </button>
              ))}
            </div>
          </div>

          {/* PDF Preview */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[#F3F4F6]">
              <h2 className="font-bold text-[#111827] text-sm">
                Preview: {order.files[activeFile]?.name ?? "No file"}
              </h2>
              <div className="flex gap-2">
                <a
                  id="print-btn"
                  href={order.files[activeFile]?.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-[#2E8B57] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#1F6B42] transition-colors"
                >
                  <Printer className="h-4 w-4" />
                  Print
                </a>
                <a
                  href={order.files[activeFile]?.url ?? "#"}
                  download
                  className="inline-flex items-center gap-1.5 bg-[#F3F4F6] text-[#374151] rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#E5E7EB] transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            </div>
            <div className="bg-[#F3F4F6] flex items-center justify-center" style={{ height: "400px" }}>
              {order.files[activeFile]?.url && order.files[activeFile].url !== "#" ? (
                <iframe
                  src={`${order.files[activeFile].url}#toolbar=0&navpanes=0`}
                  className="w-full h-full border-0"
                  title={`Preview ${order.files[activeFile].name}`}
                />
              ) : (
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-[#E5E7EB] flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <FileText className="h-8 w-8 text-red-500" />
                  </div>
                  <p className="text-[#374151] font-medium">{order.files[activeFile]?.name ?? "No file"}</p>
                  <p className="text-sm text-[#9CA3AF] mt-1">
                    Preview not available — download to view
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Status History */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="font-bold text-[#111827] mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Status History
            </h2>
            <div className="relative pl-5 space-y-4">
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[#E5E7EB]" />
              {[...order.status_history].reverse().map((entry, i) => (
                <div key={i} className="relative flex items-start gap-3">
                  <div className={`absolute -left-5 w-3.5 h-3.5 rounded-full border-2 ${
                    i === 0 ? "bg-[#2E8B57] border-[#2E8B57]" : "bg-white border-[#D1D5DB]"
                  }`} />
                  <div>
                    <p className="text-sm font-semibold text-[#374151]">
                      {getStatusLabel(entry.status)}
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      {formatDateTime(entry.timestamp)}
                    </p>
                    {entry.note && (
                      <p className="text-xs text-[#6B7280] mt-0.5">{entry.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Reject dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-slide-in-up">
            <h3 className="text-xl font-bold text-[#111827] mb-1">Reject Order</h3>
            <p className="text-sm text-[#6B7280] mb-4">
              Let the customer know why you can&apos;t fulfil this order.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (optional)…"
              rows={3}
              className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#EF4444] resize-none mb-4"
            />
            <div className="flex gap-3">
              <Button
                variant="destructive"
                className="flex-1"
                loading={processing}
                onClick={() => handleAction("rejected", rejectReason || undefined)}
              >
                Reject Order
              </Button>
              <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
