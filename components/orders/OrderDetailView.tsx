"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, FileText, Phone, Download, Printer,
  Check, Package, Circle, X, AlertTriangle, IndianRupee,
  User, Calendar, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  formatCurrency, formatDateTime, formatFileSize,
  getStatusColor, getStatusLabel, getNextStatus, getNextStatusLabel,
} from "@/lib/utils";
import { useOrderStatus } from "@/lib/hooks/useOrderStatus";
import { TimeAgo } from "@/components/dashboard/TimeAgo";
import type { Order, OrderStatus } from "@/types";

interface OrderDetailViewProps {
  order: Order;
}

const STATUS_STEPS: OrderStatus[] = ["PLACED", "ACCEPTED", "PRINTING", "READY", "COMPLETED"];

export function OrderDetailView({ order: initialOrder }: OrderDetailViewProps) {
  const [order, setOrder] = useState(initialOrder);
  const [openingFileUrl, setOpeningFileUrl] = useState<string | null>(null);
  const [downloadingFileUrl, setDownloadingFileUrl] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Client-side signed URL cache (valid for the lifetime of this component)
  const signedUrlCache = useRef(new Map<string, string>());

  const { updateStatus, processing } = useOrderStatus(order.id, {
    onSuccess: (newStatus) => setOrder((o) => ({ ...o, order_status: newStatus })),
  });

  const loadPreview = useCallback(async (path: string) => {
    if (!path) return;
    setPreviewLoading(true);
    setPreviewError(null);

    // Check client-side cache
    if (signedUrlCache.current.has(path)) {
      console.log(`[OrderDetailView] Cache hit for preview: ${path}`);
      setPreviewUrl(signedUrlCache.current.get(path)!);
      setPreviewLoading(false);
      return;
    }

    setPreviewUrl(null);
    console.log(`[OrderDetailView] Starting preview load. Bucket: order-files, Path: ${path}`);
    console.time("signed-url");
    console.time("preview-load");

    try {
      const extension = path.split(".").pop()?.toLowerCase() || "";
      console.log(`[OrderDetailView] File type identified: ${extension}`);

      // Generate signed URL (expires in 1 hour)
      const res = await fetch(`/api/storage/signed-url?bucket=order-files&path=${path}`);
      if (!res.ok) {
        throw new Error(`Failed to generate signed URL (HTTP ${res.status})`);
      }
      const data = await res.json();
      console.timeEnd("signed-url");

      if (!data.signedUrl) {
        throw new Error(data.error || "No signed URL returned from server");
      }

      console.log(`[OrderDetailView] Signed URL generated successfully`);

      // Cache it
      signedUrlCache.current.set(path, data.signedUrl);
      setPreviewUrl(data.signedUrl);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown storage error";
      console.error("[OrderDetailView] Preview load error:", errMsg);
      setPreviewError(errMsg);
    } finally {
      setPreviewLoading(false);
      console.timeEnd("preview-load");
    }
  }, []);

  const handleDownloadFile = useCallback(async (path: string, fileName: string) => {
    if (!path) return;
    setDownloadingFileUrl(path);
    console.log(`[OrderDetailView] Starting download for path: ${path}`);
    console.time("download");
    try {
      let downloadUrl = signedUrlCache.current.get(path);

      if (!downloadUrl) {
        const res = await fetch(`/api/storage/signed-url?bucket=order-files&path=${path}`);
        if (!res.ok) {
          throw new Error(`Failed to generate download URL (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (!data.signedUrl) {
          throw new Error(data.error || "No signed URL returned for download");
        }
        downloadUrl = data.signedUrl as string;
        signedUrlCache.current.set(path, downloadUrl);
        console.log(`[OrderDetailView] Signed URL generated for download: success`);
      } else {
        console.log(`[OrderDetailView] Download Cache hit for: ${path}`);
      }

      if (!downloadUrl) {
        throw new Error("Download URL could not be resolved");
      }

      // Trigger download using hidden anchor element
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log(`[OrderDetailView] Download initiated for: ${fileName}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown download error";
      console.error("[OrderDetailView] Download error:", errMsg);
      toast.error(`Error downloading file: ${errMsg}`);
    } finally {
      setDownloadingFileUrl(null);
      console.timeEnd("download");
    }
  }, []);

  // Trigger preview load when selected index or files list changes
  useEffect(() => {
    const filesList = order.files && order.files.length > 0 ? order.files : [
      { name: order.file_name, size: 0, pages: order.page_count, url: order.file_s3_key }
    ];
    const currentFile = filesList[previewIndex] || filesList[0];
    if (currentFile?.url) {
      loadPreview(currentFile.url);
    } else {
      setPreviewError("No file URL available");
      setPreviewUrl(null);
    }
  }, [previewIndex, order.files, order.file_s3_key, order.file_name, order.page_count, loadPreview]);

  const handleOpenPdf = useCallback(async (path?: string) => {
    const s3Path = path || order.file_s3_key;
    if (!s3Path) return;
    setOpeningFileUrl(s3Path);
    try {
      let docUrl = signedUrlCache.current.get(s3Path);

      if (!docUrl) {
        const res = await fetch(`/api/storage/signed-url?bucket=order-files&path=${s3Path}`);
        const data = await res.json();
        if (data.signedUrl) {
          docUrl = data.signedUrl as string;
          signedUrlCache.current.set(s3Path, docUrl);
        } else {
          toast.error("Failed to get document access");
          return;
        }
      }

      if (!docUrl) {
        toast.error("No document URL resolved");
        return;
      }

      window.open(docUrl, "_blank");
    } catch (err) {
      console.error("[OrderDetailView] Signed URL fetch error:", err);
      toast.error("Error accessing document");
    } finally {
      setOpeningFileUrl(null);
    }
  }, [order.file_s3_key]);

  const nextStatus = getNextStatus(order.order_status);



  const currentStep = STATUS_STEPS.indexOf(order.order_status);

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/orders">
          <Button variant="ghost" size="icon-sm" aria-label="Back to orders">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Order #{order.short_token}</h1>
          <p className="text-sm text-[#6B7280]">
            Placed <TimeAgo date={order.created_at} />
          </p>
        </div>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold border ${getStatusColor(order.order_status)}`}>
          {getStatusLabel(order.order_status)}
        </span>
      </div>

      {/* Status Timeline */}
      {!["CANCELLED", "REJECTED"].includes(order.order_status) && (
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
                {(order.customer_name?.[0] ?? "G").toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-[#374151]">
                  {order.customer_name || "Guest"}
                </p>
                <p className="text-sm text-[#6B7280]">
                  {order.customer_phone || "—"}
                </p>
                {order.customer_phone && (
                  <a
                    href={`tel:${order.customer_phone}`}
                    className="text-sm text-[#2E8B57] hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {order.customer_phone}
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
                ["Total Files", (order.files?.length || 1).toString()],
                ["Total Copies", (order.files?.reduce((sum, f) => sum + (f.copies || 1), 0) || order.copies).toString()],
                ["Total Pages to Print", (order.files?.reduce((sum, f) => sum + (f.pages || 1) * (f.copies || 1), 0) || (order.page_count * order.copies)).toString()],
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
          </div>

          {/* Special Instructions */}
          {order.notes && (
            <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="h-4 w-4 text-[#92400E]" />
                <h2 className="font-bold text-[#92400E] text-sm">Special Instructions</h2>
              </div>
              <p className="text-sm text-[#92400E]">{order.notes}</p>
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
                onClick={() => updateStatus(nextStatus)}
              >
                {nextStatus === "ACCEPTED" && <Check className="h-5 w-5" />}
                {nextStatus === "PRINTING" && <Printer className="h-5 w-5" />}
                {nextStatus === "READY" && <Package className="h-5 w-5" />}
                 {nextStatus === "COMPLETED" && <Circle className="h-5 w-5" />}
                {getNextStatusLabel(order.order_status)}
              </Button>
            )}
            {order.order_status === "PLACED" && (
              <Button
                id={`detail-reject-${order.id}`}
                variant="outline"
                className="w-full border-[#EF4444] text-[#EF4444] hover:bg-[#FEE2E2]"
                onClick={() => setShowRejectDialog(true)}
                disabled={processing}
              >
                <X className="h-4 w-4" /> Reject Order
              </Button>
            )}
          </div>
        </div>

        {/* Right: File Preview */}
        <div className="lg:col-span-3 space-y-4">
          {/* File Card */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="font-bold text-[#111827] mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents List
            </h2>
            <div className="space-y-3">
              {(() => {
                const filesList = order.files && order.files.length > 0 ? order.files : [
                  { name: order.file_name, size: 0, pages: order.page_count, url: order.file_s3_key, copies: order.copies, color: order.color, doubleSided: order.double_sided }
                ];
                return filesList.map((file, idx) => {
                  const isSelected = idx === previewIndex;
                  return (
                    <div
                      key={idx}
                      onClick={() => setPreviewIndex(idx)}
                      className={`w-full flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "border-[#2E8B57] bg-[#2E8B57]/5 shadow-sm"
                          : "border-[#E5E7EB] bg-[#F9FAFB] hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          file.name?.toLowerCase().endsWith(".pdf") ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                        }`}>
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#374151] truncate">{file.name || "Document.pdf"}</p>
                          <p className="text-xs text-[#9CA3AF] mt-0.5">
                            {file.pages} pages {file.size > 0 && `· ${formatFileSize(file.size)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-white border border-[#E5E7EB] text-[#374151] text-[10px] font-semibold">
                            {file.copies ?? 1} copies
                          </span>
                          <span className="px-2 py-0.5 rounded bg-white border border-[#E5E7EB] text-[#374151] text-[10px] font-semibold">
                            {file.color ? "Color" : "B&W"}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-white border border-[#E5E7EB] text-[#374151] text-[10px] font-semibold">
                            {file.doubleSided ? "2-sided" : "1-sided"}
                          </span>
                        </div>
                        {file.url && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-[#6B7280] hover:text-[#2E8B57] hover:bg-emerald-50 shrink-0"
                            loading={downloadingFileUrl === file.url}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadFile(file.url, file.name);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* PDF/Image Preview Card */}
          {(() => {
            const filesList = order.files && order.files.length > 0 ? order.files : [
              { name: order.file_name, size: 0, pages: order.page_count, url: order.file_s3_key }
            ];
            const currentFile = filesList[previewIndex] || filesList[0];
            return (
              <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-[#F3F4F6]">
                  <h2 className="font-bold text-[#111827] text-sm truncate max-w-[50%]">
                    Preview: {currentFile?.name || "Document"}
                  </h2>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      loading={downloadingFileUrl === currentFile?.url}
                      onClick={() => handleDownloadFile(currentFile?.url, currentFile?.name || "Document")}
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      Download
                    </Button>
                    {currentFile?.name?.toLowerCase().endsWith(".pdf") && (
                      <Button
                        size="sm"
                        className="bg-[#2E8B57] hover:bg-[#1F6B42]"
                        loading={openingFileUrl === currentFile?.url}
                        onClick={() => handleOpenPdf(currentFile?.url)}
                      >
                        <Printer className="h-4 w-4 mr-1.5" />
                        Open PDF
                      </Button>
                    )}
                  </div>
                </div>
                <div className="bg-[#F3F4F6] flex items-center justify-center p-4" style={{ height: "450px" }}>
                  {previewLoading ? (
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 animate-spin text-[#2E8B57] mx-auto mb-3" />
                      <p className="text-sm text-[#6B7280] font-semibold">Loading document preview...</p>
                    </div>
                  ) : previewError ? (
                    <div className="text-center px-4">
                      <AlertTriangle className="w-12 h-12 text-[#EF4444] mx-auto mb-3 animate-pulse" />
                      <p className="text-[#374151] font-semibold text-sm">Preview unavailable</p>
                      <p className="text-xs text-[#9CA3AF] mt-1 max-w-xs mx-auto break-words">{previewError}</p>
                      <Button
                        variant="outline"
                        className="mt-4 gap-2"
                        loading={downloadingFileUrl === currentFile?.url}
                        onClick={() => handleDownloadFile(currentFile?.url, currentFile?.name || "Document")}
                      >
                        <Download className="h-4 w-4" /> Download File
                      </Button>
                    </div>
                  ) : previewUrl ? (
                    (() => {
                      const ext = currentFile?.name?.split(".").pop()?.toLowerCase() || "";
                      if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
                        return (
                          <div className="w-full h-full flex items-center justify-center relative bg-white rounded-lg p-2 border border-[#E5E7EB]">
                            <img
                              src={previewUrl}
                              alt={currentFile?.name || "Image preview"}
                              className="max-h-full max-w-full object-contain"
                              onLoad={() => console.log(`[OrderDetailView] Image preview rendered successfully`)}
                              onError={() => setPreviewError("Failed to render image")}
                            />
                          </div>
                        );
                      } else if (ext === "pdf") {
                        return (
                          <div className="w-full h-full bg-white rounded-lg overflow-hidden border border-[#E5E7EB]">
                            <iframe
                              src={`${previewUrl}#toolbar=0`}
                              className="w-full h-full border-0"
                              title="PDF Preview"
                              onLoad={() => console.log(`[OrderDetailView] PDF preview iframe loaded`)}
                            />
                          </div>
                        );
                      } else {
                        return (
                          <div className="text-center px-4">
                            <FileText className="w-16 h-16 text-[#6B7280] mx-auto mb-3" />
                            <p className="text-[#374151] font-semibold text-sm">Preview unavailable for this file type</p>
                            <p className="text-xs text-[#9CA3AF] mt-1">Direct download is available below</p>
                            <Button
                              variant="outline"
                              className="mt-4 gap-2"
                              loading={downloadingFileUrl === currentFile?.url}
                              onClick={() => handleDownloadFile(currentFile?.url, currentFile?.name || "Document")}
                            >
                              <Download className="h-4 w-4" /> Download File
                            </Button>
                          </div>
                        );
                      }
                    })()
                  ) : (
                    <div className="text-center">
                      <FileText className="w-12 h-12 text-[#9CA3AF] mx-auto mb-2" />
                      <p className="text-sm text-[#6B7280]">No preview available</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Status History */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="font-bold text-[#111827] mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Status History
            </h2>
            <div className="relative pl-5 space-y-4">
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[#E5E7EB]" />
              {(order.status_history || []).slice().reverse().map((entry, i) => (
                <div key={i} className="relative flex items-start gap-3">
                  <div className={`absolute -left-5 w-3.5 h-3.5 rounded-full border-2 ${
                    i === 0 ? "bg-[#2E8B57] border-[#2E8B57]" : "bg-white border-[#D1D5DB]"
                  }`} />
                  <div>
                    <p className="text-sm font-semibold text-[#374151]">
                      {getStatusLabel(entry.status)}
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      {formatDateTime((entry.at || entry.timestamp) || "")}
                    </p>
                    {entry.actor && (
                      <p className="text-xs text-[#6B7280] mt-0.5">By {entry.actor}</p>
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
                 onClick={() => updateStatus("CANCELLED", rejectReason || undefined)}
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
