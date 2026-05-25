"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  CheckCircle2, Clock, Printer, 
  XCircle, ArrowLeft, Phone,
  FileText, RefreshCcw, AlertCircle, Store,
  Sparkles, Check, Navigation, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatFileSize } from "@/lib/utils";
import type { Order, Shop } from "@/types";
import { motion } from "framer-motion";
import { useUploadQueue } from "@/hooks/useUploadQueue";

export default function OrderStatusPage() {
  const params = useParams();
  const router = useRouter();
  const shortToken = params.shortToken as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const shopId = order?.shop_id || "";
  const orderId = order?.id || "";

  const {
    files: uploadQueueFiles,
    retryFile,
  } = useUploadQueue({
    shopId,
    orderId,
    disabled: !orderId,
  });

  const isSyncing = uploadQueueFiles.some(
    (f) =>
      f.status === "uploading" ||
      f.status === "queued" ||
      f.status === "preparing" ||
      f.status === "verifying" ||
      f.status === "retrying"
  );

  const hasFailedUploads = uploadQueueFiles.some(
    (f) => f.status === "failed" || f.status === "cancelled"
  );

  const loadOrder = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);
    
    try {
      const res = await fetch(`/api/orders?shortToken=${shortToken}`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data);
      }
    } catch (err) {
      console.error("Failed to load order:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [shortToken]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // Real-time updates
  useEffect(() => {
    if (!shortToken) return;
    
    const supabase = createClient();
    const channel = supabase
      .channel(`order_${shortToken}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `short_token=eq.${shortToken}`,
        },
        () => {
          loadOrder(false); // Reload to get relations
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [shortToken, loadOrder]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB]">
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute w-20 h-20 rounded-full border-4 border-emerald-500/10 border-t-emerald-500 animate-spin" />
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
        </div>
        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Tracking Order...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB] p-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-10 shadow-xl max-w-md w-full border border-slate-100"
        >
          <XCircle className="w-16 h-16 text-red-500 mb-4 mx-auto" />
          <h1 className="text-2xl font-black text-slate-900 mb-2">Order Not Found</h1>
          <p className="text-slate-500 mb-6 font-medium text-sm">We couldn&apos;t find an order with this link. It might have expired or been deleted.</p>
          <Button 
            onClick={() => router.push("/")} 
            className="w-full h-14 rounded-xl bg-slate-900 hover:bg-slate-950 text-white font-bold transition shadow-lg"
          >
            Go Home
          </Button>
        </motion.div>
      </div>
    );
  }

  const shop = order.shops as unknown as Shop;
  const status = order.order_status;
  const hasMultipleFiles = order.files && order.files.length > 0;
  
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-50 via-slate-50 to-white pb-16 font-sans antialiased font-medium text-slate-800">
      
      {/* Sticky Minimal Navbar */}
      <div className="bg-white/70 backdrop-blur-md border-b border-slate-100/80 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push("/")} 
              className="p-2 hover:bg-slate-100 rounded-xl transition"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600" />
            </button>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Order ID</p>
              <h1 className="font-extrabold text-slate-900 tracking-tight">{order.short_token}</h1>
            </div>
          </div>
          <button 
            onClick={() => loadOrder(false)}
            className={`p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition shadow-sm ${
              isRefreshing ? "animate-spin text-emerald-600" : "text-slate-600"
            }`}
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 mt-6 space-y-6">
        
        {/* State Banner / Main Success Card */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl shadow-slate-900/[0.02] border border-slate-100/80 overflow-hidden"
        >
          {/* Header Gradient based on status */}
          <div className={`p-8 text-center text-white relative flex flex-col items-center justify-center min-h-[220px] ${
            status === "PLACED" || status === "DRAFT" ? "bg-gradient-to-br from-indigo-600 to-violet-700" :
            status === "ACCEPTED" || status === "PRINTING" ? "bg-gradient-to-br from-emerald-600 to-teal-700" :
            status === "READY" ? "bg-gradient-to-br from-amber-500 to-orange-600" :
            status === "COMPLETED" ? "bg-gradient-to-br from-slate-800 to-slate-950" :
            "bg-gradient-to-br from-rose-600 to-red-700"
          }`}>
            <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 opacity-5">
              <Printer className="w-48 h-48" />
            </div>
            
            <motion.div 
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-5 border border-white/10 shadow-inner"
            >
              {status === "PLACED" || status === "DRAFT" ? <Clock className="w-9 h-9" /> :
               status === "ACCEPTED" ? <Sparkles className="w-9 h-9 animate-pulse" /> :
               status === "PRINTING" ? <Printer className="w-9 h-9 animate-bounce" /> :
               status === "READY" ? <CheckCircle2 className="w-9 h-9 animate-pulse" /> :
               status === "COMPLETED" ? <Check className="w-10 h-10" /> :
               <XCircle className="w-9 h-9" />}
            </motion.div>
            
            <h2 className="text-3xl font-black mb-1.5 tracking-tight">
              {status === "PLACED" || status === "DRAFT" ? "Order Placed" :
               status === "ACCEPTED" ? "Order Accepted" :
               status === "PRINTING" ? "Printing Now" :
               status === "READY" ? "Ready for Pickup!" :
               status === "COMPLETED" ? "Completed" :
               "Order Cancelled"}
            </h2>
            <p className="text-white/80 font-bold uppercase tracking-widest text-[10px]">
              {status === "PLACED" || status === "DRAFT" ? "Waiting for store approval" :
               status === "ACCEPTED" ? "Store preparing sheets" :
               status === "PRINTING" ? "Vivid ink hitting paper now" :
               status === "READY" ? "Ready at the pickup counter" :
               status === "COMPLETED" ? "Thank you for using SmartPrint" :
               "This session has been terminated"}
            </p>
          </div>

          {/* Details & Custom Stepper */}
          <div className="p-6 md:p-8 space-y-8">
            
            {/* Live Sync Banner */}
            <div className="flex items-center justify-center gap-2 py-2 px-4 bg-emerald-50 rounded-xl text-emerald-800 text-[10px] font-extrabold uppercase tracking-widest border border-emerald-100/50 w-full">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span>Live Real-time Sync Active</span>
            </div>

            {/* Premium Stepper */}
            {!["CANCELLED"].includes(status) && (
              <div className="flex justify-between items-start pt-2">
                {[
                  { id: "PLACED", label: "Placed" },
                  { id: "ACCEPTED", label: "Accepted" },
                  { id: "PRINTING", label: "Printing" },
                  { id: "READY", label: "Ready" }
                ].map((step, i, arr) => {
                  const states = ["PLACED", "ACCEPTED", "PRINTING", "READY", "COMPLETED"];
                  const currentIdx = states.indexOf(status === "DRAFT" ? "PLACED" : status);
                  const stepIdx = states.indexOf(step.id);
                  const isDone = stepIdx <= currentIdx;
                  const isActive = stepIdx === currentIdx;
                  
                  return (
                    <div key={step.id} className="flex flex-col items-center relative flex-1">
                      {i < arr.length - 1 && (
                        <div className={`absolute left-1/2 top-3 w-full h-[3px] rounded-full transition-colors duration-500 ${
                          stepIdx < currentIdx ? "bg-emerald-500" : "bg-slate-100"
                        }`} />
                      )}
                      
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs z-10 transition-all duration-500 ${
                        isDone 
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/10" 
                          : "bg-slate-100 text-slate-400 border border-slate-200/50"
                      } ${isActive ? "ring-4 ring-emerald-500/10 scale-110" : ""}`}>
                        {isDone ? (
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        )}
                      </div>
                      <span className={`text-[9px] mt-3 font-extrabold uppercase tracking-widest ${
                        isDone ? "text-slate-800" : "text-slate-400"
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Bill Info Box */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Order Status</span>
                <p className="font-extrabold text-slate-800 text-lg mt-1">{status}</p>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
                <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-widest">Pay at Counter</span>
                <p className="text-2xl font-black text-emerald-700 mt-0.5">{formatCurrency(order.total_amount)}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {isSyncing && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-indigo-50 border border-indigo-100 rounded-3xl p-5 flex items-center gap-4 shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-100/50 flex items-center justify-center text-indigo-600 shrink-0">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-indigo-900 text-sm">Syncing Files in Background...</h3>
              <p className="text-indigo-700 text-xs font-semibold mt-0.5">
                We are uploading your documents directly to the store. Please keep this page open.
              </p>
            </div>
          </motion.div>
        )}

        {hasFailedUploads && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-rose-50 border border-rose-100 rounded-3xl p-5 flex items-center gap-4 shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-100/50 flex items-center justify-center text-rose-500 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-rose-850 text-sm">Upload Sync Failed</h3>
              <p className="text-rose-700 text-xs font-semibold mt-0.5">
                One or more files failed to sync. Tap the retry button next to the file to resume.
              </p>
            </div>
          </motion.div>
        )}

        {/* Shop Info Card */}
        {shop && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 text-lg tracking-tight flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-600 shrink-0" /> Pickup Store
              </h3>
              <div className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                shop.is_open !== false ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              }`}>
                {shop.is_open !== false ? "Open Now" : "Closed"}
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 shadow-inner text-emerald-600">
                <Store className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="font-extrabold text-slate-900 text-lg tracking-tight">{shop.name}</p>
                <p className="text-slate-500 text-sm leading-relaxed">{shop.address_line1}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.name + " " + (shop.address_line1 || ""))}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="w-full h-12 rounded-xl border-slate-100 bg-slate-50 hover:bg-white font-extrabold text-xs uppercase tracking-wider gap-2">
                  <Navigation className="w-4 h-4 text-slate-500" /> Directions
                </Button>
              </a>
              <a href={`tel:${shop.owner_phone}`}>
                <Button variant="outline" className="w-full h-12 rounded-xl border-slate-100 bg-slate-50 hover:bg-white font-extrabold text-xs uppercase tracking-wider gap-2">
                  <Phone className="w-4 h-4 text-slate-500" /> Call Store
                </Button>
              </a>
            </div>
          </motion.div>
        )}

        {/* Order Details list */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-6"
        >
          <h3 className="font-extrabold text-slate-800 text-lg tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600 shrink-0" /> Order Details
          </h3>
          
          {hasMultipleFiles ? (
            <div className="space-y-3">
              {order.files?.map((file, idx) => {
                const queueFile = uploadQueueFiles.find((qf) => qf.name === file.name);
                const isActivelyUploading = queueFile && (
                  queueFile.status === "uploading" ||
                  queueFile.status === "queued" ||
                  queueFile.status === "preparing" ||
                  queueFile.status === "verifying" ||
                  queueFile.status === "retrying"
                );
                const isFailed = queueFile && (queueFile.status === "failed" || queueFile.status === "cancelled");

                return (
                  <div key={idx} className="flex flex-col gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center shrink-0 border border-rose-100 text-rose-500 relative">
                        {queueFile?.status === "completed" && (
                          <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center z-10 rounded-xl">
                            <Check className="w-5 h-5 text-emerald-600" />
                          </div>
                        )}
                        {isActivelyUploading && (
                          <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center z-10 rounded-xl">
                            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                          </div>
                        )}
                        <FileText className="w-5.5 h-5.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-slate-900 truncate text-sm" title={file.name}>{file.name}</p>
                        <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">
                          {formatFileSize(file.size)} · {file.pages} {file.pages === 1 ? "Page" : "Pages"} · {file.copies || 1} {(file.copies || 1) === 1 ? "Copy" : "Copies"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isFailed ? (
                          <button
                            onClick={() => retryFile(queueFile.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-[9px] font-black uppercase tracking-wider transition active:scale-95"
                          >
                            <RefreshCcw className="w-3 h-3 animate-spin-reverse" />
                            Retry
                          </button>
                        ) : isActivelyUploading ? (
                          <div className="px-2.5 py-1 rounded-lg text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-100/50 font-extrabold uppercase tracking-wider">
                            {queueFile.status === "verifying" ? "Verifying" : `Uploading ${queueFile.progress}%`}
                          </div>
                        ) : (
                          <>
                            <div className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider ${
                              file.color ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-700"
                            }`}>
                              {file.color ? "Color" : "B&W"}
                            </div>
                            <div className="px-2.5 py-1 rounded-lg text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-100/50 font-extrabold uppercase tracking-wider">
                              {file.doubleSided ? "2-Sided" : "1-Sided"}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {isActivelyUploading && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full bg-slate-200/50 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${queueFile.progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      </div>
                    )}

                    {isFailed && (
                      <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1 bg-rose-50/50 rounded-lg p-1.5 border border-rose-100/30">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {queueFile.error || "Sync failed. Please check internet connection."}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
              <div className="flex items-center gap-4">
                {(() => {
                  const queueFile = uploadQueueFiles.find((qf) => qf.name === order.file_name);
                  const isActivelyUploading = queueFile && (
                    queueFile.status === "uploading" ||
                    queueFile.status === "queued" ||
                    queueFile.status === "preparing" ||
                    queueFile.status === "verifying" ||
                    queueFile.status === "retrying"
                  );
                  const isFailed = queueFile && (queueFile.status === "failed" || queueFile.status === "cancelled");

                  return (
                    <>
                      <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center shrink-0 border border-rose-100 text-rose-500 relative">
                        {queueFile?.status === "completed" && (
                          <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center z-10 rounded-xl">
                            <Check className="w-5 h-5 text-emerald-600" />
                          </div>
                        )}
                        {isActivelyUploading && (
                          <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center z-10 rounded-xl">
                            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                          </div>
                        )}
                        <FileText className="w-5.5 h-5.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-slate-900 truncate text-sm">{order.file_name || "Document"}</p>
                        <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">
                          {order.page_count} Pages · {order.copies} {order.copies === 1 ? "Copy" : "Copies"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isFailed ? (
                          <button
                            onClick={() => retryFile(queueFile.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-[9px] font-black uppercase tracking-wider transition active:scale-95"
                          >
                            <RefreshCcw className="w-3 h-3 animate-spin-reverse" />
                            Retry
                          </button>
                        ) : isActivelyUploading ? (
                          <div className="px-2.5 py-1 rounded-lg text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-100/50 font-extrabold uppercase tracking-wider">
                            {queueFile.status === "verifying" ? "Verifying" : `Uploading ${queueFile.progress}%`}
                          </div>
                        ) : (
                          <div className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider ${
                            order.color ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-700"
                          }`}>
                            {order.color ? "Color" : "B&W"}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>

              {(() => {
                const queueFile = uploadQueueFiles.find((qf) => qf.name === order.file_name);
                const isActivelyUploading = queueFile && (
                  queueFile.status === "uploading" ||
                  queueFile.status === "queued" ||
                  queueFile.status === "preparing" ||
                  queueFile.status === "verifying" ||
                  queueFile.status === "retrying"
                );
                const isFailed = queueFile && (queueFile.status === "failed" || queueFile.status === "cancelled");

                return (
                  <>
                    {isActivelyUploading && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full bg-slate-200/50 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${queueFile.progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      </div>
                    )}
                    {isFailed && (
                      <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1 bg-rose-50/50 rounded-lg p-1.5 border border-rose-100/30">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {queueFile.error || "Sync failed. Please check internet connection."}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100/50">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Print Sides</span>
              <span className="font-extrabold text-slate-800 text-sm mt-1 block">
                {hasMultipleFiles ? "Mixed" : (order.double_sided ? "Double-Sided" : "Single-Sided")}
              </span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100/50">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Order Volume</span>
              <span className="font-extrabold text-slate-800 text-sm mt-1 block">
                {hasMultipleFiles 
                  ? `${order.files?.reduce((acc, f) => acc + (f.pages * (f.copies || 1)), 0) || 0} Total Pages`
                  : `${order.page_count * order.copies} Total Pages`}
              </span>
            </div>
          </div>

          {order.notes && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100/50 flex gap-3 text-slate-700">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-[9px] font-extrabold text-amber-700 uppercase tracking-widest block font-sans">Special notes</span>
                <p className="text-xs font-semibold text-amber-900 leading-normal">{order.notes}</p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Support section */}
        <div className="text-center space-y-4 pt-4">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-full border border-slate-100 shadow-sm text-xs font-bold text-slate-500">
            <span>Need assistance? Call the store at</span>
            <span className="text-emerald-600 font-extrabold">{shop?.owner_phone}</span>
          </div>
          <p className="text-[9px] font-extrabold text-slate-300 uppercase tracking-[0.3em]">
            SmartPrint Secure Print Cloud v2.0
          </p>
        </div>

      </main>
    </div>
  );
}
