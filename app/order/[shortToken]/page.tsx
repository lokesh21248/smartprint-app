"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  CheckCircle2, Clock, Printer, Package, 
  XCircle, ArrowLeft, Loader2, MapPin, Phone,
  FileText, RefreshCcw, ExternalLink, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Order, Shop } from "@/types";

export default function OrderStatusPage() {
  const params = useParams();
  const router = useRouter();
  const shortToken = params.shortToken as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
        (payload) => {
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
        <p className="text-gray-600 font-bold uppercase tracking-widest text-[10px]">Tracking Order...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <XCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-black text-gray-900 mb-2">Order Not Found</h1>
        <p className="text-gray-600 mb-6 font-medium">We couldn&apos;t find an order with this link. It might have expired or been deleted.</p>
        <Button onClick={() => router.push("/")} className="rounded-2xl px-8 shadow-lg shadow-emerald-600/20">Go Home</Button>
      </div>
    );
  }

  const shop = order.shops as unknown as Shop;
  const status = order.order_status;
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")} className="p-2 hover:bg-gray-100 rounded-xl transition">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Order ID</p>
              <h1 className="font-black text-gray-900 tracking-tight">{order.short_token}</h1>
            </div>
          </div>
          <button 
            onClick={() => loadOrder(false)}
            className={`p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition shadow-sm ${isRefreshing ? "animate-spin text-emerald-600" : "text-gray-600"}`}
          >
            <RefreshCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 mt-8 space-y-6">
        {/* Status Card */}
        <div className="bg-white rounded-[2rem] shadow-2xl shadow-emerald-900/5 border border-gray-100 overflow-hidden">
          <div className={`p-10 text-center text-white relative ${
            status === "PLACED" || status === "DRAFT" ? "bg-gradient-to-br from-blue-600 to-indigo-700" :
            status === "ACCEPTED" || status === "PRINTING" ? "bg-gradient-to-br from-emerald-600 to-teal-700" :
            status === "READY" ? "bg-gradient-to-br from-orange-500 to-amber-600" :
            status === "COMPLETED" ? "bg-gradient-to-br from-gray-800 to-black" :
            "bg-gradient-to-br from-red-600 to-rose-700"
          }`}>
            <div className="absolute top-4 right-6 opacity-20">
              <Printer className="w-24 h-24" />
            </div>
            
            <div className="w-24 h-24 rounded-3xl bg-white/20 flex items-center justify-center mx-auto mb-6 backdrop-blur-md shadow-inner">
              {status === "PLACED" || status === "DRAFT" ? <Clock className="w-12 h-12" /> :
               status === "ACCEPTED" ? <CheckCircle2 className="w-12 h-12" /> :
               status === "PRINTING" ? <Printer className="w-12 h-12 animate-bounce" /> :
               status === "READY" ? <Package className="w-12 h-12 animate-pulse" /> :
               status === "COMPLETED" ? <CheckCircle2 className="w-12 h-12" /> :
               <XCircle className="w-12 h-12" />}
            </div>
            
            <h2 className="text-4xl font-black mb-2 tracking-tight">
              {status === "PLACED" || status === "DRAFT" ? "Pending" :
               status === "ACCEPTED" ? "Accepted" :
               status === "PRINTING" ? "Printing" :
               status === "READY" ? "Ready!" :
               status === "COMPLETED" ? "Picked Up" :
               "Cancelled"}
            </h2>
            <p className="text-white/80 font-bold uppercase tracking-widest text-xs">
              {status === "PLACED" || status === "DRAFT" ? "Waiting for shop review" :
               status === "ACCEPTED" ? "Shop is preparing your order" :
               status === "PRINTING" ? "Ink is hitting the paper now" :
               status === "READY" ? "Come to the shop for pickup" :
               status === "COMPLETED" ? "Transaction finished" :
               "This order will not be processed"}
            </p>
          </div>

          <div className="p-8 space-y-8">
            {/* Progress line */}
            {!["CANCELLED"].includes(status) && (
              <div className="flex justify-between items-start">
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
                        <div className={`absolute left-1/2 top-4 w-full h-1.5 rounded-full ${
                          stepIdx < currentIdx ? "bg-emerald-500" : "bg-gray-100"
                        }`} />
                      )}
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm z-10 transition-all duration-500 ${
                        isDone ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "bg-gray-100 text-gray-400"
                      } ${isActive ? "ring-4 ring-emerald-100 scale-110" : ""}`}>
                        {isDone ? <CheckCircle2 className="w-6 h-6" /> : <div className="w-2 h-2 rounded-full bg-gray-300" />}
                      </div>
                      <span className={`text-[10px] mt-3 font-black uppercase tracking-widest ${
                        isDone ? "text-emerald-700" : "text-gray-400"
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${status === "READY" ? "bg-orange-500 animate-pulse" : "bg-emerald-500"}`} />
                  <p className="font-black text-gray-900">{status}</p>
                </div>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Amount to Pay</p>
                <p className="text-2xl font-black text-emerald-700">{formatCurrency(order.total_amount)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Shop Info Card */}
        {shop && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-gray-900 text-xl tracking-tight flex items-center gap-2">
                <MapPin className="w-6 h-6 text-emerald-600" /> Store Details
              </h3>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${shop.is_open ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                {shop.is_open ? "Open Now" : "Closed"}
              </div>
            </div>
            
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 shadow-inner">
                <Store className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <p className="font-black text-xl text-gray-900">{shop.name}</p>
                <p className="text-gray-500 font-medium leading-relaxed mt-1">{shop.address}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.name + " " + shop.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button variant="outline" className="w-full h-14 rounded-2xl border-gray-100 bg-gray-50 hover:bg-white font-black text-xs uppercase tracking-widest gap-2">
                  <MapPin className="w-4 h-4" /> Directions
                </Button>
              </a>
              <a href={`tel:${shop.phone}`} className="flex-1">
                <Button variant="outline" className="w-full h-14 rounded-2xl border-gray-100 bg-gray-50 hover:bg-white font-black text-xs uppercase tracking-widest gap-2">
                  <Phone className="w-4 h-4" /> Call Shop
                </Button>
              </a>
            </div>
          </div>
        )}

        {/* Order Items Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-6">
          <h3 className="font-black text-gray-900 text-xl tracking-tight flex items-center gap-2">
            <FileText className="h-6 h-6 text-emerald-600" /> Order Details
          </h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-md">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center shrink-0 border border-rose-100">
                <FileText className="w-6 h-6 text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-gray-900 truncate">{order.file_name || "Document"}</p>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                  {order.page_count} Pages · {order.copies} Copies
                </p>
              </div>
              <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${order.color ? "bg-orange-100 text-orange-700" : "bg-gray-200 text-gray-700"}`}>
                {order.color ? "Color" : "B&W"}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Print Type</p>
              <p className="font-black text-emerald-900">{order.double_sided ? "Double-Sided" : "Single-Sided"}</p>
            </div>
            <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Copies</p>
              <p className="font-black text-emerald-900">{order.copies} Sets</p>
            </div>
          </div>

          {order.notes && (
            <div className="p-5 bg-orange-50 rounded-2xl border border-orange-100 flex gap-3">
              <AlertCircle className="h-5 w-5 text-orange-500 shrink-0" />
              <div>
                <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Special Notes</p>
                <p className="text-sm font-medium text-orange-900">{order.notes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Support footer */}
        <div className="text-center space-y-6 pt-6">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-white rounded-full border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-500 font-bold">
              Need help? Call the shop at <span className="text-emerald-600 font-black tracking-tight">{shop?.phone}</span>
            </p>
          </div>
          <div className="flex items-center justify-center gap-4 opacity-30">
            <div className="h-px bg-gray-300 flex-1" />
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">SmartPrint QR v1.0</p>
            <div className="h-px bg-gray-300 flex-1" />
          </div>
        </div>
      </main>
    </div>
  );
}
