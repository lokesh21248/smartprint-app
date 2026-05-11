"use client";

import { Suspense, useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Loader2,
  Upload,
  FileText,
  Plus,
  Minus,
  Check,
  User,
  ShieldCheck,
  Zap,
  Clock,
  Printer,
  ChevronRight,
  Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";

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
  // Name is pre-filled from landing page URL param
  const nameParam = searchParams.get("name") ?? "";

  // State
  const [shop, setShop] = useState<ShopDisplay | null>(null);
  const [isLoadingShop, setIsLoadingShop] = useState(true);

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [copies, setCopies] = useState(1);
  const [isColor, setIsColor] = useState(true); // Default to color print
  const [isDoubleSided, setIsDoubleSided] = useState(false); // Default to single sided
  const [notes, setNotes] = useState("");

  const { user, isLoaded } = useUser();

  // Pre-filled from landing page or user; editable as fallback
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Handle file upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Robust validation
    if (selectedFile.size === 0) {
      toast.error("File is empty.");
      return;
    }

    // Android Chrome often sends PDFs as application/octet-stream or empty type.
    // Validate by BOTH mime type and file extension to handle all browsers.
    const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.error("Please upload a valid PDF file");
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error("File size limit is 50MB");
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);
    setPdfParseFailed(false);

    console.log(`[PDF Upload] Name: ${selectedFile.name}, Size: ${selectedFile.size}, Type: ${selectedFile.type}`);

    try {
      console.log(`[PDF Parsing] Reading ArrayBuffer...`);
      const arrayBuffer = await selectedFile.arrayBuffer();

      console.log(`[PDF Parsing] Initializing PDF-lib document...`);
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const numPages = pdfDoc.getPageCount();

      console.log(`[PDF Parsing] Success. Pages: ${numPages}`);
      setPageCount(numPages);
      toast.success(`PDF analyzed: ${numPages} pages detected`);
    } catch (err) {
      console.error("[PDF Parsing] Failed:", err);
      // Fallback: allow direct upload even if preview/parsing fails
      toast.error("Could not automatically count pages. Please enter them manually.");
      setPdfParseFailed(true);
      setPageCount(1); // Default to 1
    } finally {
      setIsProcessing(false);
      setStep(2); // Always proceed to Step 2
    }
  };



  // Calculate total
  const totalAmount = useMemo(() => {
    if (!pageCount || !shop) return 0;
    const rate = isColor ? (shop.price_color_per_page || 0) : (shop.price_bw_per_page || 0);
    return pageCount * copies * rate;
  }, [pageCount, copies, isColor, shop]);

  // Submit order — direct-to-Supabase upload (bypasses Vercel entirely)
  const handlePlaceOrder = async () => {
    if (!file || !shop?.id) return;

    if (!customerName || customerName.trim().length < 3) {
      toast.error("Please enter your name");
      return;
    }

    // ─── Frontend Safety Validation (Sanitize & Validate Phone) ─────────────
    const rawDigits = customerPhone.replace(/\D/g, "");
    const cleanedPhone = (rawDigits.length === 12 && rawDigits.startsWith("91")) 
      ? rawDigits.slice(2) 
      : rawDigits;
    
    if (cleanedPhone.length !== 10) {
      toast.error("Enter valid 10-digit phone number");
      return;
    }

    // Capitalize words
    const formattedName = customerName
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    setIsSubmitting(true);

    try {
      // ── Step 1: Get a signed upload URL from our server ──────────────────────
      const presignRes = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: shop.id,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });

      if (!presignRes.ok) {
        const { error } = await presignRes.json();
        throw new Error(error || "Failed to prepare upload");
      }

      const { signedUrl, storagePath } = await presignRes.json();

      // ── Step 2: PUT file DIRECTLY to Supabase Storage ───────────────────────
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("File upload to storage failed");
      }
      
      // ── Step 3: Create order record with sanitized phone ──────────────────
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
          customerPhone: cleanedPhone, // Send sanitized 10-digit phone
        }),
      });

      const raw = await res.text();
      console.log("RAW API RESPONSE:", raw);

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("Server returned invalid JSON");
      }

      if (res.ok) {
        // Navigate before clearing isSubmitting — component unmounts cleanly
        router.push(`/order/${data.shortToken}`);
      } else {
        // Throw specific error message from the backend if available
        throw new Error(data.message || data.error || "Order creation failed");
      }
    } catch (err) {
      console.error("[Order Submission Error]:", err);
      // Ensure the error message string doesn't say "Error: Error: ..."
      const message = err instanceof Error ? err.message.replace(/^Error:\s*/, '') : "Error placing order";
      toast.error(message);
      setIsSubmitting(false); // Only reset on failure; success navigates away
    }
  };

  if (isLoadingShop) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAFA]">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Loading SmartPrint...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-20">
      {/* Dynamic Header */}
      <div className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">{shop?.name}</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-500" /> Secure Cloud Print
            </p>
          </div>
          <div className="flex gap-1">
            {[1, 2].map((s) => (
              <div key={s} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${step >= s ? "bg-emerald-500" : "bg-gray-100"}`} />
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 mt-8 space-y-8">
        {/* Step 1: File Upload */}
        <div className={`transition-all duration-500 ${step !== 1 ? "opacity-50 scale-95 pointer-events-none blur-sm hidden" : "opacity-100 scale-100"}`}>
          <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-emerald-900/5 p-10 text-center border border-gray-100">
            <div className="w-24 h-24 rounded-3xl bg-emerald-50 flex items-center justify-center mx-auto mb-8 shadow-inner">
              <Upload className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Upload Documents</h2>
            <p className="text-gray-500 font-medium mb-2">We support high-quality PDF printing up to 50MB</p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full text-emerald-700 text-[10px] font-black uppercase tracking-widest mb-10">
              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Files auto-deleted after 2 hours for privacy
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-4 border-dashed border-gray-100 rounded-[2rem] p-12 cursor-pointer hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
            >
              <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
              {isProcessing ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
                  <p className="font-black text-emerald-900">Analyzing PDF...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-white group-hover:shadow-lg transition-all mb-4">
                    <FileText className="w-8 h-8 text-gray-400 group-hover:text-emerald-600" />
                  </div>
                  <p className="font-black text-gray-900 text-lg">Click to select PDF</p>
                  <p className="text-xs text-gray-400 font-bold uppercase mt-2">Maximum 50 Pages per file</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Print Configuration */}
        <div className={`transition-all duration-500 ${step !== 2 ? "hidden" : "opacity-100 scale-100"}`}>
          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center shadow-inner">
                  <Printer className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">Configuration</h2>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{file?.name}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Color Mode */}
                <button
                  onClick={() => setIsColor(!isColor)}
                  className={`p-6 rounded-3xl border-2 transition-all text-left relative overflow-hidden ${isColor ? "border-orange-500 bg-orange-50" : "border-gray-100 bg-gray-50"}`}
                >
                  <div className={`p-2 rounded-lg inline-block mb-3 ${isColor ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <p className={`font-black text-lg ${isColor ? "text-orange-900" : "text-gray-900"}`}>{isColor ? "Color Print" : "Black & White"}</p>
                  <p className="text-xs font-bold text-gray-400 uppercase">Premium Vivid Ink</p>
                  {isColor && <Check className="absolute top-4 right-4 text-orange-600" />}
                </button>

                {/* Sidedness */}
                <button
                  onClick={() => setIsDoubleSided(!isDoubleSided)}
                  className={`p-6 rounded-3xl border-2 transition-all text-left relative overflow-hidden ${isDoubleSided ? "border-emerald-500 bg-emerald-50" : "border-gray-100 bg-gray-50"}`}
                >
                  <div className={`p-2 rounded-lg inline-block mb-3 ${isDoubleSided ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <p className={`font-black text-lg ${isDoubleSided ? "text-emerald-900" : "text-gray-900"}`}>{isDoubleSided ? "Double-Sided" : "Single-Sided"}</p>
                  <p className="text-xs font-bold text-gray-400 uppercase">Save Paper</p>
                  {isDoubleSided && <Check className="absolute top-4 right-4 text-emerald-600" />}
                </button>
              </div>

              {/* Fallback Page Counter */}
              {pdfParseFailed && (
                <div className="mt-6 p-6 bg-rose-50 rounded-3xl flex items-center justify-between border border-rose-100">
                  <div>
                    <p className="font-black text-rose-900">Document Pages</p>
                    <p className="text-xs text-rose-500 font-bold uppercase tracking-tighter">Enter pages manually</p>
                  </div>
                  <div className="flex items-center gap-6 bg-white rounded-2xl p-2 shadow-sm border border-rose-100">
                    <button onClick={() => setPageCount(Math.max(1, (pageCount || 1) - 1))} className="w-10 h-10 rounded-xl hover:bg-gray-50 flex items-center justify-center transition-colors">
                      <Minus className="w-4 h-4 text-gray-400" />
                    </button>
                    <span className="text-2xl font-black text-gray-900 w-8 text-center">{pageCount || 1}</span>
                    <button onClick={() => setPageCount(Math.min(500, (pageCount || 1) + 1))} className="w-10 h-10 rounded-xl hover:bg-gray-50 flex items-center justify-center transition-colors">
                      <Plus className="w-4 h-4 text-rose-600" />
                    </button>
                  </div>
                </div>
              )}

              {/* Copies Counter */}
              <div className="mt-6 p-6 bg-gray-50 rounded-3xl flex items-center justify-between border border-gray-100">
                <div>
                  <p className="font-black text-gray-900">Number of Copies</p>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-tighter">Total sets to print</p>
                </div>
                <div className="flex items-center gap-6 bg-white rounded-2xl p-2 shadow-sm border border-gray-100">
                  <button onClick={() => setCopies(Math.max(1, copies - 1))} className="w-10 h-10 rounded-xl hover:bg-gray-50 flex items-center justify-center transition-colors">
                    <Minus className="w-4 h-4 text-gray-400" />
                  </button>
                  <span className="text-2xl font-black text-gray-900 w-8 text-center">{copies}</span>
                  <button onClick={() => setCopies(Math.min(50, copies + 1))} className="w-10 h-10 rounded-xl hover:bg-gray-50 flex items-center justify-center transition-colors">
                    <Plus className="w-4 h-4 text-emerald-600" />
                  </button>
                </div>
              </div>

              <div className="mt-8">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1 mb-2 block">Special Instructions</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="E.g. Use glossy paper, staple top-left..."
                  className="w-full bg-gray-50 rounded-3xl p-6 text-sm border-none focus:ring-2 focus:ring-emerald-500 outline-none min-h-[100px] transition-all"
                />
              </div>
            </div>

            {/* Name & Phone Info */}
            <div className="mt-6 space-y-4">
              <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block">Full Name</label>
                <div className="relative group">
                  <User className="absolute left-4 top-4 h-5 w-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    placeholder="Enter your name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full pl-12 h-14 rounded-2xl border border-gray-200 bg-white text-base font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block">Mobile Number</label>
                <div className="relative group">
                  <Phone className="absolute left-4 top-4 h-5 w-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    placeholder="10-digit mobile number"
                    type="tel"
                    maxLength={10}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="w-full pl-12 h-14 rounded-2xl border border-gray-200 bg-white text-base font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <p className="text-[10px] text-gray-400 font-bold mt-2 ml-1">For order updates & pickup notifications</p>
              </div>
            </div>

            <div className="mt-8 bg-emerald-600 rounded-[2rem] p-8 text-white flex items-center justify-between shadow-xl shadow-emerald-600/20">
              <div>
                <p className="text-emerald-100 font-bold uppercase tracking-widest text-[10px] mb-1">Estimated Total</p>
                <p className="text-4xl font-black">{formatCurrency(totalAmount)}</p>
                {customerName && <p className="text-emerald-200 text-xs font-bold mt-1">for {customerName}</p>}
              </div>
              <Button
                onClick={handlePlaceOrder}
                disabled={isSubmitting || !customerName || customerName.trim().length < 3 || customerPhone.length < 10}
                className="bg-white text-emerald-700 px-8 py-4 rounded-2xl font-black flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:scale-100"
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin w-5 h-5" />
                ) : (
                  <>Place Order <ChevronRight className="w-5 h-5" /></>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Shop Badge */}
        {step === 2 && (
          <div className="text-center">
            <div className="inline-flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-gray-100 shadow-sm">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span className="text-gray-900 font-black text-sm">{shop?.name}</span>
            </div>
          </div>
        )}
      </main>

      {/* Quick Help Footer */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 z-50 pointer-events-none">
        <div className="max-w-2xl mx-auto flex justify-center">
          <div className="bg-gray-900/90 backdrop-blur-md text-white px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl pointer-events-auto border border-white/10 transition-all hover:scale-105">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <p className="text-[10px] font-black uppercase tracking-widest">Questions? Call {shop?.name}{shop?.phone ? ` · ${shop.phone}` : ""}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function OrderUploadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>}>
      <OrderUploadPageInner />
    </Suspense>
  );
}
