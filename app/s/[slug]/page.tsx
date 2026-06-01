"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Loader2, 
  AlertCircle, 
  Store, 
  ShieldCheck,
  MapPin,
  Smartphone,
  Sparkles,
  ArrowRight,
  Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { Scan2PaperLogo } from "@/components/shared/Scan2PaperLogo";

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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute w-20 h-20 rounded-full border-4 border-emerald-500/10 border-t-emerald-500 animate-spin" />
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600">
              <Store className="w-6 h-6" />
            </div>
          </div>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Connecting to Shop...</p>
        </motion.div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center border border-gray-100/80"
        >
          <div className="w-20 h-20 rounded-3xl bg-rose-50 flex items-center justify-center mx-auto mb-6 shadow-inner">
            <AlertCircle className="w-10 h-10 text-rose-500" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Shop Not Found</h1>
          <p className="text-gray-500 font-medium mb-8 leading-relaxed">The link you followed might be broken or the shop has been removed.</p>
          <Button 
            onClick={() => router.push("/")} 
            className="w-full h-14 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold transition-all duration-300"
          >
            Go Home
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-50/50 via-slate-50 to-white pb-24 font-sans antialiased font-medium">
      {/* Structured data is injected server-side by app/s/[slug]/layout.tsx */}
      
      {/* Sticky Premium Minimal Navbar */}
      <nav className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-slate-100/80 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Scan2PaperLogo variant="icon" size={30} color="color" />
            <span className="font-extrabold text-sm tracking-tight text-slate-800">Scan2Paper</span>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${shop.is_open !== false ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {shop.is_open !== false && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            )}
            {shop.is_open !== false ? "Open Now" : "Closed"}
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto pt-10 px-4 space-y-8">
        
        {/* Dynamic Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-4"
        >
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/10 rounded-full text-emerald-700 text-[10px] font-extrabold uppercase tracking-widest">
            <Sparkles className="w-3 h-3 text-emerald-600 animate-pulse" /> Self-Service Smart Print
          </div>
          
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight">
            Instant Printing at <br/>
            <span className="bg-gradient-to-r from-emerald-600 to-teal-700 bg-clip-text text-transparent font-extrabold">
              {shop.name}
            </span>
          </h1>

          <div className="flex items-center justify-center gap-1.5 text-slate-500 text-sm font-semibold">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate max-w-[90%]">{shop.address}</span>
          </div>
        </motion.div>

        {/* Pricing & Opening Info Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid grid-cols-2 gap-4"
        >
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-100 shadow-sm shadow-slate-100/50 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Black & White</span>
              <p className="text-3xl font-black text-slate-800 mt-1">
                {formatCurrency(Number(shop.price_bw_per_page))}
                <span className="text-xs font-semibold text-slate-400 ml-0.5">/page</span>
              </p>
            </div>
            <div className="mt-4 text-[10px] font-bold text-slate-400 uppercase">Standard Laser Print</div>
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-100 shadow-sm shadow-slate-100/50 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Color Print</span>
              <p className="text-3xl font-black text-emerald-600 mt-1">
                {formatCurrency(Number(shop.price_color_per_page))}
                <span className="text-xs font-semibold text-slate-400 ml-0.5">/page</span>
              </p>
            </div>
            <div className="mt-4 text-[10px] font-bold text-emerald-600 uppercase">Vivid High-Ink</div>
          </div>
        </motion.div>

        {/* Entry Form Card */}
        <motion.div 
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="bg-white rounded-3xl shadow-xl shadow-emerald-900/[0.03] border border-slate-100/80 p-8 md:p-10 space-y-8"
        >
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Let&apos;s get started</h2>
            <p className="text-sm text-slate-500 font-medium">Enter your name below to start your private upload session.</p>
          </div>

          <div className="space-y-6">
            <div className="relative">
              <Input
                placeholder="Enter your full name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-16 rounded-2xl border-slate-100 bg-slate-50 text-slate-800 text-lg font-semibold focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 px-6 transition-all duration-300 shadow-inner placeholder:text-slate-400"
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

                // 1. Offline check
                if (typeof navigator !== "undefined" && !navigator.onLine) {
                  toast.error("You appear to be offline. Please check your connection and try again.");
                  setIsStartingSession(false);
                  return;
                }

                // 2. Timeout helper
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

                // 3. Error mapper
                const getErrorMsg = (status: number, data: { error?: string }): string => {
                  if (status === 429) return "Too many requests. Please wait a moment and try again.";
                  if (status === 503) return "Service temporarily unavailable. Please try again in a few seconds.";
                  if (status === 400) return data.error || "Invalid details. Please check and try again.";
                  if (status >= 500) return "Server error. We're retrying…";
                  return data.error || "Could not start your session. Please try again.";
                };

                try {
                  let res: Response;

                  // 4. Attempt 1
                  try {
                    res = await attemptSession(25000);
                  } catch (firstErr) {
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

                  // 5. Retry on 5xx
                  if (res.status >= 500) {
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

                  // 6. JSON Parse
                  let data: { success?: boolean; sessionId?: string; error?: string } = {};
                  try {
                    data = await res.json();
                  } catch {
                    toast.error("Unexpected server response. Please try again.");
                    setIsStartingSession(false);
                    return;
                  }

                  // 7. Redirect success
                  if (res.ok && data.success && data.sessionId) {
                    router.push(
                      `/order-upload?shopSlug=${slug}&sessionId=${data.sessionId}&name=${encodeURIComponent(trimmedName)}`
                    );
                    return;
                  }

                  // 8. API Level Error
                  toast.error(getErrorMsg(res.status, data));
                  setIsStartingSession(false);
                } catch (err) {
                  console.error("[ORDER FLOW ERROR] Unhandled exception:", err);
                  toast.error("Something went wrong. Please try again.");
                  setIsStartingSession(false);
                }
              }}
              disabled={isStartingSession || customerName.trim().length < 3}
              className="w-full h-16 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-lg shadow-xl shadow-emerald-500/10 transition-all duration-300 flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none"
            >
              {isStartingSession ? (
                <>
                  <Loader2 className="animate-spin w-5 h-5" /> Starting session...
                </>
              ) : (
                <>
                  Start Printing <ArrowRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </div>

          {/* Secure indicator */}
          <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold pt-2 border-t border-slate-50">
            <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>End-to-End Secure Processing</span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
            <span>GDPR Guarded</span>
          </div>
        </motion.div>

        {/* Feature Highlights */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {[
            { icon: Smartphone, title: "Zero Apps Required", desc: "No downloads, no logins. Upload and check out directly inside your web browser." },
            { icon: ShieldCheck, title: "Auto-Deletion Privacy", desc: "For absolute safety, your printed files are permanently wiped after 2 hours." }
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm shadow-slate-500/[0.01] flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 text-emerald-600 border border-emerald-100/50">
                <item.icon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight">{item.title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed font-medium">{item.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Process Steps */}
        <motion.div 
          initial={{ opacity: 0, y: 35 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25 }}
          className="space-y-6 pt-4"
        >
          <h2 className="text-xl font-black text-slate-800 tracking-tight text-center">Seamless 3-Step Print</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { step: "01", title: "Detail", desc: "Enter your name" },
              { step: "02", title: "Upload", desc: "Choose PDF files" },
              { step: "03", title: "Print", desc: "Ready at counter" },
            ].map((item) => (
              <div key={item.step} className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-slate-100 text-center flex flex-col items-center">
                <span className="text-[10px] font-black text-emerald-500 tracking-widest px-2 py-0.5 bg-emerald-50 rounded-full mb-2">{item.step}</span>
                <h3 className="font-extrabold text-slate-800 text-sm mb-1">{item.title}</h3>
                <p className="text-slate-400 text-[10px] font-medium leading-normal">{item.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Branding Footer */}
        <div className="pt-8 text-center text-slate-300 font-bold uppercase tracking-[0.3em] text-[9px]">
          Scan2Paper — Secure Print Cloud
        </div>
      </div>
    </div>
  );
}
