"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Loader2, 
  AlertCircle, 
  Store, 
  Zap, 
  ShieldCheck,
  ChevronRight,
  MapPin,
  Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ShopDisplay {
  id?: string;
  name?: string;
  address?: string;
  phone?: string;
  is_open?: boolean;
  price_bw_per_page?: number;
  price_color_per_page?: number;
  opening_time?: string;
  closing_time?: string;
  slug?: string;
  [key: string]: unknown;
}
import { ShopStructuredData } from "@/components/seo/ShopStructuredData";
import { formatCurrency } from "@/lib/utils";

export default function QRLandingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [shop, setShop] = useState<ShopDisplay | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [isStartingSession, setIsStartingSession] = useState(false);

  useEffect(() => {
    const fetchShop = async () => {
      try {
        const res = await fetch(`/api/shop/public?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          setError("Shop not found");
          setIsLoading(false);
          return;
        }
        const data = await res.json();
        setShop(data);
        setIsLoading(false);
      } catch {
        setError("Failed to load shop information");
        setIsLoading(false);
      }
    };

    fetchShop();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAFA]">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Connecting to Shop...</p>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-6">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 max-w-md w-full text-center border border-gray-100">
          <div className="w-20 h-20 rounded-3xl bg-rose-50 flex items-center justify-center mx-auto mb-6 shadow-inner">
            <AlertCircle className="w-10 h-10 text-rose-500" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Shop Not Found</h1>
          <p className="text-gray-500 font-medium mb-8 leading-relaxed">The link you followed might be broken or the shop has been removed.</p>
          <Button onClick={() => router.push("/")} className="w-full h-14 rounded-2xl bg-gray-900 hover:bg-black text-white font-black">Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-20">
      <ShopStructuredData shop={shop} />
      <div className="max-w-2xl mx-auto pt-12 px-4">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full text-emerald-700 text-xs font-black uppercase tracking-widest mb-4">
            <Zap className="w-3 h-3 fill-emerald-700" /> Powered by SmartPrint
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight leading-tight">{shop.name}</h1>
          <div className="flex items-center justify-center gap-2 text-gray-400 mt-3 font-medium">
            <MapPin className="w-4 h-4 text-emerald-500" /> {shop.address}
          </div>
        </div>

        {/* Shop Info Card */}
        <div className="bg-white rounded-[3rem] shadow-2xl shadow-emerald-900/5 overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-10 text-white relative">
            <div className="absolute top-6 right-6 opacity-10">
              <Store className="w-32 h-32" />
            </div>
            
            <div className="flex items-center justify-between mb-8">
              <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-md ${shop.is_open ? "bg-white/20 text-white" : "bg-rose-500/80 text-white"}`}>
                {shop.is_open ? "● Open Now" : "● Closed"}
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-100">
                {shop.opening_time?.slice(0, 5)} - {shop.closing_time?.slice(0, 5)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-2">Black & White</p>
                <p className="text-3xl font-black">{formatCurrency(Number(shop.price_bw_per_page))}<span className="text-xs font-medium ml-1">/page</span></p>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-2">Color Print</p>
                <p className="text-3xl font-black text-orange-200">{formatCurrency(Number(shop.price_color_per_page))}<span className="text-xs font-medium ml-1">/page</span></p>
              </div>
            </div>
          </div>

          <div className="p-10 space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {[
                { icon: Smartphone, title: "No App Required", desc: "Just upload and track via your browser" },
                { icon: ShieldCheck, title: "Encrypted Flow", desc: "Your documents are securely processed" }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                    <item.icon className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900 tracking-tight">{item.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed font-medium">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm mt-6">
              <div className="mb-6">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Customer Details</h2>
                <p className="text-sm text-gray-500 font-medium">Enter your name to continue placing your order</p>
              </div>
              <div className="space-y-6">
                <div className="relative group">
                  <Input
                    placeholder="Enter your name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-16 rounded-2xl border-gray-100 bg-gray-50 text-lg font-semibold focus:ring-emerald-500 px-6"
                  />
                </div>
                <Button
                  onClick={async () => {
                    const trimmedName = customerName.trim();
                    if (trimmedName.length < 3) {
                      toast.error("Please enter your name (at least 3 characters).");
                      return;
                    }
                    setIsStartingSession(true);

                    // 1. Offline check before making any request
                    if (typeof navigator !== "undefined" && !navigator.onLine) {
                      toast.error("You appear to be offline. Please check your connection and try again.");
                      setIsStartingSession(false);
                      return;
                    }

                    // 2. Helper: single attempt with configurable timeout
                    const attemptSession = async (timeoutMs: number): Promise<Response> => {
                      const controller = new AbortController();
                      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                      try {
                        return await fetch("/api/sessions", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ customer_name: trimmedName, shop_slug: slug }),
                          signal: controller.signal,
                          cache: "no-store",
                          credentials: "same-origin",
                        });
                      } finally {
                        clearTimeout(timeoutId);
                      }
                    };

                    // 3. Helper: readable error from response
                    const getErrorMsg = (status: number, data: { error?: string }): string => {
                      if (status === 429) return "Too many requests. Please wait a moment and try again.";
                      if (status === 503) return "Service temporarily unavailable. Please try again in a few seconds.";
                      if (status === 400) return data.error || "Invalid details. Please check and try again.";
                      if (status >= 500) return "Server error. We're retrying…";
                      return data.error || "Could not start your session. Please try again.";
                    };

                    try {
                      let res: Response;

                      // 4. First attempt — 25s handles Vercel cold start + Clerk middleware
                      try {
                        res = await attemptSession(25000);
                      } catch (firstErr) {
                        // Network failure or timeout — wait 1.5s then retry once
                        console.error("[ORDER FLOW ERROR] First attempt failed:", firstErr);
                        try {
                          await new Promise((r) => setTimeout(r, 1500));
                          res = await attemptSession(20000);
                        } catch (retryErr) {
                          console.error("[ORDER FLOW ERROR] Retry also failed:", retryErr);
                          const isTimeout = retryErr instanceof Error && retryErr.name === "AbortError";
                          toast.error(
                            isTimeout
                              ? "Request timed out. Please check your connection and try again."
                              : "Connection failed. Please check your network and try again."
                          );
                          setIsStartingSession(false);
                          return;
                        }
                      }

                      // 5. Retry once on 5xx server errors
                      if (res.status >= 500) {
                        console.warn("[ORDER FLOW] 5xx on first attempt, retrying:", res.status);
                        try {
                          await new Promise((r) => setTimeout(r, 2000));
                          res = await attemptSession(20000);
                        } catch (retryErr) {
                          console.error("[ORDER FLOW ERROR] 5xx retry network failed:", retryErr);
                          toast.error("Server error. Please try again in a moment.");
                          setIsStartingSession(false);
                          return;
                        }
                      }

                      // 6. Parse response body
                      let data: { success?: boolean; sessionId?: string; error?: string } = {};
                      try {
                        data = await res.json();
                      } catch {
                        console.error("[ORDER FLOW ERROR] Failed to parse response JSON");
                        toast.error("Unexpected server response. Please try again.");
                        setIsStartingSession(false);
                        return;
                      }

                      // 7. Success path
                      if (res.ok && data.success && data.sessionId) {
                        router.push(
                          `/order-upload?shopSlug=${slug}&sessionId=${data.sessionId}&name=${encodeURIComponent(trimmedName)}`
                        );
                        // Keep spinner — navigation in progress
                        return;
                      }

                      // 8. API-level error
                      console.error("[ORDER FLOW ERROR] API error:", res.status, data);
                      toast.error(getErrorMsg(res.status, data));
                      setIsStartingSession(false);
                    } catch (err) {
                      console.error("[ORDER FLOW ERROR] Unhandled exception:", err);
                      toast.error("Something went wrong. Please try again.");
                      setIsStartingSession(false);
                    }
                  }}
                  disabled={isStartingSession || customerName.trim().length < 3}
                  className="w-full h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xl shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  {isStartingSession ? (
                    <Loader2 className="animate-spin w-6 h-6" />
                  ) : (
                    <>
                      Continue <ChevronRight className="w-6 h-6" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* How it Works */}
        <div className="mt-12 space-y-8">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight text-center">Simple 3-Step Process</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "01", title: "Details", desc: "Enter your name" },
              { step: "02", title: "Upload", desc: "Choose your PDF" },
              { step: "03", title: "Pay & Print", desc: "Order is instantly sent to the shop" },
            ].map((item) => (
              <div key={item.step} className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                <p className="text-4xl font-black text-emerald-500/20 mb-4">{item.step}</p>
                <h3 className="font-black text-gray-900 mb-2 tracking-tight">{item.title}</h3>
                <p className="text-sm text-gray-400 font-medium leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 text-center">
          <div className="h-px bg-gray-200 w-full mb-8" />
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em]">SmartPrint Pilot v1.0</p>
        </div>
      </div>
    </div>
  );
}
