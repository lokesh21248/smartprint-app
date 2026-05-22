"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Loader2,
  FileText,
  Plus,
  Minus,
  User,
  ShieldCheck,
  Clock,
  Printer,
  ChevronRight,
  Phone,
  ArrowLeft,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { ModernUploaderV2 } from "@/components/upload/ModernUploaderV2";
import type { FileReadyPayload } from "@/components/upload/ModernUploaderV2";

interface ShopDisplay {
  id?: string;
  name?: string;
  address?: string;
  phone?: string;
  is_open?: boolean;
  price_bw_per_page?: number;
  price_color_per_page?: number;
}

function OrderUploadPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shopSlug = searchParams.get("shopSlug");
  const nameParam = searchParams.get("name") ?? "";

  // State
  const [shop, setShop] = useState<ShopDisplay | null>(null);
  const [isLoadingShop, setIsLoadingShop] = useState(true);

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [copies, setCopies] = useState(1);
  const [isColor, setIsColor] = useState(false); // B&W as default for cost friendliness
  const [isDoubleSided, setIsDoubleSided] = useState(true); // Double sided default to save paper
  const [notes, setNotes] = useState("");

  const { user, isLoaded } = useUser();

  const [customerName, setCustomerName] = useState(nameParam);
  const [customerPhone, setCustomerPhone] = useState("");

  // Initialize from Clerk if logged in
  useEffect(() => {
    if (isLoaded && user) {
      if (!nameParam && user.fullName) {
        setCustomerName(user.fullName);
      }
      if (user.primaryPhoneNumber) {
        setCustomerPhone(user.primaryPhoneNumber.phoneNumber);
      }
    }
  }, [isLoaded, user, nameParam]);

  const [pdfParseFailed, setPdfParseFailed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeoutError, setTimeoutError] = useState(false);

  // Handle file ready from ModernUploaderV2
  const handleFileReady = ({ file, pageCount: pages, pdfParseFailed: parseFailed }: FileReadyPayload) => {
    setFile(file);
    setPageCount(pages);
    setPdfParseFailed(parseFailed);
    setStep(2);
  };

  // Load shop
  useEffect(() => {
    if (!shopSlug) {
      toast.error("Invalid URL: Shop missing");
      return;
    }

    const loadShop = async () => {
      try {
        const res = await fetch(`/api/shop/public?slug=${encodeURIComponent(shopSlug)}`);

        if (!res.ok) {
          toast.error("Shop not found or unavailable");
          setIsLoadingShop(false);
          return;
        }

        const data = await res.json();
        setShop({
          id: data.id,
          name: data.name,
          address: data.address,
          phone: data.phone,
          price_bw_per_page: data.price_bw_per_page,
          price_color_per_page: data.price_color_per_page,
          is_open: data.is_open,
        });
        setIsLoadingShop(false);
      } catch {
        toast.error("Failed to load shop. Check your connection.");
        setIsLoadingShop(false);
      }
    };

    loadShop();
  }, [shopSlug]);


  // Calculate total
  const totalAmount = useMemo(() => {
    if (!pageCount || !shop) return 0;
    const rate = isColor ? (shop.price_color_per_page || 0) : (shop.price_bw_per_page || 0);
    return pageCount * copies * rate;
  }, [pageCount, copies, isColor, shop]);

  // Submit order
  const handlePlaceOrder = async () => {
    if (!file || !shop?.id) return;

    if (!customerName || customerName.trim().length < 3) {
      toast.error("Please enter your name");
      return;
    }

    const rawDigits = customerPhone.replace(/\D/g, "");
    const cleanedPhone = (rawDigits.length === 12 && rawDigits.startsWith("91")) 
      ? rawDigits.slice(2) 
      : rawDigits;
    
    if (cleanedPhone.length !== 10) {
      toast.error("Enter valid 10-digit phone number");
      return;
    }

    const formattedName = customerName
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    setIsSubmitting(true);
    setTimeoutError(false);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 25000);

    try {
      const presignRes = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: shop.id,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
        signal: controller.signal,
      });

      if (!presignRes.ok) {
        const { error } = await presignRes.json();
        throw new Error(error || "Failed to prepare upload");
      }

      const { signedUrl, storagePath } = await presignRes.json();

      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("File upload to storage failed");
      }
      
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: shop.id,
          filePath: storagePath,
          fileName: file.name,
          fileSize: file.size,
          pageCount: Math.max(1, parseInt(String(pageCount)) || 1),
          copies: Math.max(1, parseInt(String(copies)) || 1),
          color: Boolean(isColor),
          doubleSided: Boolean(isDoubleSided),
          notes: notes?.trim() || "",
          customerName: formattedName,
          customerPhone: cleanedPhone,
        }),
        signal: controller.signal,
      });

      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("Server returned invalid JSON");
      }

      if (res.ok) {
        router.push(`/order/${data.shortToken}`);
      } else {
        throw new Error(data.message || data.error || "Order creation failed");
      }
    } catch (err) {
      console.error("[Order Submission Error]:", err);
      setIsSubmitting(false);
      
      const isTimeout = (err as Error).name === "AbortError";
      if (isTimeout) {
        setTimeoutError(true);
        toast.error("Server is taking longer than expected. Please retry.");
      } else {
        const message = err instanceof Error ? err.message.replace(/^Error:\s*/, '') : "Error placing order";
        toast.error(message);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  if (isLoadingShop) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB]">
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute w-20 h-20 rounded-full border-4 border-emerald-500/10 border-t-emerald-500 animate-spin" />
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600">
            <Printer className="w-6 h-6 animate-pulse" />
          </div>
        </div>
        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Loading SmartPrint...</p>
      </div>
    );
  }

  // Format file size helper
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-50 via-slate-50 to-white pb-24 font-sans antialiased font-medium text-slate-800">
      
      {/* Sticky Premium Header */}
      <div className="bg-white/70 backdrop-blur-md border-b border-slate-100/80 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button 
                onClick={() => { setStep(1); setFile(null); }} 
                className="p-2 hover:bg-slate-100 rounded-xl transition"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
            )}
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight">{shop?.name}</h1>
              <p className="text-[9px] text-emerald-700 font-extrabold uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Secure Cloud Print
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2].map((s) => (
              <div 
                key={s} 
                className={`h-1.5 w-6 rounded-full transition-all duration-300 ${
                  step >= s ? "bg-emerald-600" : "bg-slate-100"
                }`} 
              />
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 mt-6">
        <AnimatePresence mode="wait">
          
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-900/[0.02] p-6 md:p-8 space-y-6">
                <ModernUploaderV2
                  onFileReady={handleFileReady}
                  onFileRemoved={() => { setFile(null); setStep(1); }}
                  shopId={shop?.id}
                  disabled={isSubmitting}
                />
              </div>

              {/* Same-Day Pickup info card */}
              <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-100 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">Same-Day Pickup ready</h3>
                  <p className="text-slate-500 text-xs font-medium">Place your order online, pick it up at the shop instantly.</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: PRINT CONFIGURATION & CHECKOUT */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              
              {/* Document Overview Header */}
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0 text-rose-500">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-slate-800 text-base truncate">{file?.name}</h3>
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">
                      {formatSize(file?.size || 0)} · {pageCount} {pageCount === 1 ? "page" : "pages"}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => { setStep(1); setFile(null); }}
                  className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Configurations section */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-900/[0.02] p-6 md:p-8 space-y-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-inner">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Print Preferences</h2>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">Choose your ink & paper options</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Ink Type Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">Ink Mode</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setIsColor(false)}
                        className={`flex-1 py-3 rounded-lg text-xs font-extrabold transition-all ${
                          !isColor ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        B&amp;W
                      </button>
                      <button
                        onClick={() => setIsColor(true)}
                        className={`flex-1 py-3 rounded-lg text-xs font-extrabold transition-all ${
                          isColor ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        Color
                      </button>
                    </div>
                  </div>

                  {/* Sidedness Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">Sidedness</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setIsDoubleSided(false)}
                        className={`flex-1 py-3 rounded-lg text-xs font-extrabold transition-all ${
                          !isDoubleSided ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        1-Sided
                      </button>
                      <button
                        onClick={() => setIsDoubleSided(true)}
                        className={`flex-1 py-3 rounded-lg text-xs font-extrabold transition-all ${
                          isDoubleSided ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        2-Sided
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live rate information alert */}
                <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100/80">
                  <span className="text-xs font-bold text-slate-500">Current Print Rate</span>
                  <span className="text-xs font-black text-slate-800">
                    {formatCurrency(isColor ? shop?.price_color_per_page || 0 : shop?.price_bw_per_page || 0)} / page
                  </span>
                </div>

                {/* Dynamic Page Adjuster (if auto-parse failed) */}
                {pdfParseFailed && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-between">
                    <div>
                      <p className="font-extrabold text-amber-900 text-sm">Specify Page Count</p>
                      <p className="text-[9px] text-amber-600 font-bold uppercase tracking-wider">Please type or set manually</p>
                    </div>
                    <div className="flex items-center gap-4 bg-white rounded-xl p-1 shadow-sm border border-amber-100">
                      <button 
                        onClick={() => setPageCount(Math.max(1, (pageCount || 1) - 1))} 
                        className="w-8 h-8 rounded-lg hover:bg-slate-50 flex items-center justify-center transition"
                      >
                        <Minus className="w-3 h-3 text-slate-400" />
                      </button>
                      <span className="text-lg font-black text-slate-800 w-6 text-center">{pageCount || 1}</span>
                      <button 
                        onClick={() => setPageCount(Math.min(500, (pageCount || 1) + 1))} 
                        className="w-8 h-8 rounded-lg hover:bg-slate-50 flex items-center justify-center transition"
                      >
                        <Plus className="w-3 h-3 text-emerald-600" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Copies Counter */}
                <div className="p-5 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100/50">
                  <div>
                    <p className="font-extrabold text-slate-800 text-sm">Number of Copies</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total sets to produce</p>
                  </div>
                  <div className="flex items-center gap-4 bg-white rounded-xl p-1 shadow-sm border border-slate-100">
                    <button 
                      onClick={() => setCopies(Math.max(1, copies - 1))} 
                      className="w-9 h-9 rounded-lg hover:bg-slate-50 flex items-center justify-center transition"
                    >
                      <Minus className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <span className="text-xl font-black text-slate-900 w-6 text-center">{copies}</span>
                    <button 
                      onClick={() => setCopies(Math.min(50, copies + 1))} 
                      className="w-9 h-9 rounded-lg hover:bg-slate-50 flex items-center justify-center transition"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-600" />
                    </button>
                  </div>
                </div>

                {/* Special Instructions Notes */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">Special Instructions</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="E.g. Staple top-left, spiral binding requested..."
                    className="w-full bg-slate-50/50 rounded-2xl p-4 text-sm border border-slate-100 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none min-h-[90px] transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Customer Details Form */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-900/[0.02] p-6 md:p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-inner">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Delivery Info</h2>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">Your contact details for pickups</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">Full Name</label>
                    <div className="relative group">
                      <User className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      <input
                        placeholder="Enter your name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full pl-12 h-12 rounded-xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm font-semibold transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">WhatsApp / Phone Number</label>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      <input
                        placeholder="10-digit mobile number"
                        type="tel"
                        maxLength={10}
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="w-full pl-12 h-12 rounded-xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm font-semibold transition-all"
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 font-bold ml-0.5">Used strictly for real-time status & pickup updates</p>
                  </div>
                </div>
              </div>

              {/* Checkout / Pricing sticky bar */}
              <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white flex items-center justify-between shadow-2xl shadow-slate-950/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 opacity-5">
                  <Printer className="w-40 h-40" />
                </div>
                
                <div className="z-10">
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Total Print Bill</span>
                  <p className="text-3xl font-black text-emerald-400 mt-1">{formatCurrency(totalAmount)}</p>
                  <p className="text-[10px] text-slate-300 font-bold mt-1">
                    {pageCount} {pageCount === 1 ? "page" : "pages"} · {copies} {copies === 1 ? "copy" : "copies"}
                  </p>
                </div>

                <Button
                  onClick={handlePlaceOrder}
                  disabled={isSubmitting || !customerName || customerName.trim().length < 3 || customerPhone.length < 10}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 h-14 rounded-xl font-bold flex items-center gap-2 transition active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none z-10"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin w-4 h-4" /> Processing...
                    </>
                  ) : timeoutError ? (
                    <>
                      Retry Order <ChevronRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Place Order <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>

              {/* Bottom Quick Help Contact */}
              <div className="text-center pt-2 pb-6">
                <div className="inline-flex items-center gap-2 bg-white px-5 py-2.5 rounded-full border border-slate-100 shadow-sm text-slate-500 hover:scale-[1.02] transition">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    Need Help? Call Store {shop?.phone ? `at ${shop.phone}` : ""}
                  </span>
                </div>
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}

export default function OrderUploadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>}>
      <OrderUploadPageInner />
    </Suspense>
  );
}
