"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Upload, FileText, Settings, User, CheckCircle2, 
  ArrowRight, ArrowLeft, Loader2,
  ShieldCheck, AlertCircle, Trash2, Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@/lib/supabase/client";
import { formatFileSize, formatCurrency } from "@/lib/utils";
import type { Shop, PrintConfig, OrderFile } from "@/types";

type Step = "upload" | "config" | "details" | "otp" | "success";

export default function OrderFlowPage() {
  const params = useParams();
  const router = useRouter();
  const shopId = params.shopId as string;
  
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [shop, setShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Order State
  const [files, setFiles] = useState<{ file: File; pages: number }[]>([]);
  const [config, setConfig] = useState<PrintConfig>({
    color: "bw",
    size: "A4",
    copies: 1,
    binding: "none",
    duplex: false,
  });
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [otp, setOtp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{ id: string; token: string } | null>(null);

  // Fetch shop details
  useEffect(() => {
    async function loadShop() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shops")
        .select("*")
        .eq("id", shopId)
        .single();
        
      if (error || !data) {
        toast.error("Shop not found");
        router.push("/");
        return;
      }
      setShop(data);
      setIsLoading(false);
    }
    loadShop();
  }, [shopId, router]);

  const calculateTotal = useCallback(() => {
    if (!shop) return 0;
    const totalPages = files.reduce((sum, f) => sum + f.pages, 0);
    const rate = config.color === "bw" 
      ? (shop.pricing.bw_a4 ?? 2) 
      : (shop.pricing.color_a4 ?? 10);
    
    let total = totalPages * config.copies * rate;
    
    // Add binding cost
    if (config.binding === "spiral") total += (shop.pricing.binding_spiral ?? 30);
    if (config.binding === "soft") total += (shop.pricing.binding_soft ?? 50);
    
    return total;
  }, [shop, files, config]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    const newFiles: { file: File; pages: number }[] = [];
    
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      if (file.type !== "application/pdf") {
        toast.error(`${file.name} is not a PDF`);
        continue;
      }
      
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 25MB)`);
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pageCount = pdfDoc.getPageCount();
        newFiles.push({ file, pages: pageCount });
      } catch {
        toast.error(`Error reading ${file.name}`);
      }
    }

    setFiles(prev => [...prev, ...newFiles]);
  };

  const sendOtp = async () => {
    if (!customer.phone || customer.phone.length < 10) {
      toast.error("Enter a valid phone number");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: customer.phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send OTP");
      setCurrentStep("otp");
      toast.success("OTP sent to your phone!");
    } catch (err) {
      toast.error((err as Error).message || "Failed to send OTP. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtpAndSubmit = async () => {
    if (otp.length < 6) {
      toast.error("Enter 6-digit OTP");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Verify OTP
      const verifyRes = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: customer.phone, otp }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyJson.error || "Invalid OTP");

      // 2. Upload files via secure server-side route (uses service role)
      const uploadedFiles: OrderFile[] = [];
      
      for (const f of files) {
        const formData = new FormData();
        formData.append("file", f.file);
        formData.append("shopId", shopId);
        formData.append("pages", String(f.pages));

        const uploadRes = await fetch("/api/storage/upload", {
          method: "POST",
          body: formData,
        });

        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadJson.error || `Failed to upload ${f.file.name}`);

        uploadedFiles.push({
          name: f.file.name,
          size: f.file.size,
          pages: f.pages,
          url: uploadJson.url,
        });
      }

      // 3. Create Order
      const totalAmount = calculateTotal();
      const totalPages = files.reduce((sum, f) => sum + f.pages, 0);
      
      const orderRes = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          customerName: customer.name,
          customerPhone: customer.phone,
          files: uploadedFiles,
          printConfig: config,
          totalPages,
          totalAmount,
        }),
      });
      
      const orderJson = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderJson.error || "Failed to place order");
      
      setOrderResult({ id: orderJson.orderId, token: orderJson.shortToken });
      setCurrentStep("success");
      toast.success("Order placed successfully!");
    } catch (err) {
      toast.error((err as Error).message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
        <p className="text-gray-600 font-medium">Loading shop details...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 leading-tight">{shop?.shop_name}</h1>
              <p className="text-xs text-gray-500">Print Order Portal</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Step</p>
            <p className="text-lg font-black text-emerald-600 leading-none">
              {currentStep === "upload" ? "1/3" : currentStep === "config" ? "2/3" : currentStep === "details" ? "3/3" : "Done"}
            </p>
          </div>
        </div>
        <Progress 
          value={
            currentStep === "upload" ? 33 : 
            currentStep === "config" ? 66 : 
            currentStep === "details" ? 90 : 
            100
          } 
          className="h-1 rounded-none bg-gray-100"
        />
      </div>

      <main className="max-w-2xl mx-auto px-4 mt-8">
        {/* STEP 1: UPLOAD */}
        {currentStep === "upload" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-3xl shadow-sm border p-8 text-center border-dashed border-emerald-200">
              <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
                <Upload className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-black text-gray-900 mb-2">Upload your PDFs</h2>
              <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                Select one or more PDF documents you want to print. Max 25MB per file.
              </p>
              
              <input 
                type="file" 
                id="file-upload" 
                multiple 
                accept=".pdf" 
                className="hidden" 
                onChange={handleFileUpload}
              />
              <label 
                htmlFor="file-upload"
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-all shadow-lg shadow-emerald-200 cursor-pointer active:scale-95"
              >
                Choose Files <ArrowRight className="w-5 h-5" />
              </label>
            </div>

            {files.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border overflow-hidden">
                <div className="p-5 border-b bg-gray-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-gray-700">Selected Files ({files.length})</h3>
                  <button 
                    onClick={() => setFiles([])}
                    className="text-xs font-bold text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition"
                  >
                    Clear All
                  </button>
                </div>
                <div className="divide-y">
                  {files.map((f, i) => (
                    <div key={i} className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-6 h-6 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate text-sm">{f.file.name}</p>
                        <p className="text-xs text-gray-500 font-medium">
                          {formatFileSize(f.file.size)} · <span className="text-emerald-600">{f.pages} pages</span>
                        </p>
                      </div>
                      <button 
                        onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              className="w-full py-8 rounded-3xl text-xl font-black transition-all shadow-xl disabled:opacity-50"
              disabled={files.length === 0}
              onClick={() => setCurrentStep("config")}
            >
              Next: Print Options
            </Button>
          </div>
        )}

        {/* STEP 2: CONFIG */}
        {currentStep === "config" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-3xl shadow-sm border p-6 space-y-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Configure Printing</h2>
              </div>

              {/* Color Selection */}
              <div className="space-y-3">
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Color Mode</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "bw", label: "Black & White", icon: "⚫", price: shop?.pricing.bw_a4 },
                    { id: "color", label: "Color Print", icon: "🌈", price: shop?.pricing.color_a4 }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setConfig(prev => ({ ...prev, color: opt.id as PrintConfig["color"] }))}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        config.color === opt.id 
                          ? "border-emerald-600 bg-emerald-50 ring-4 ring-emerald-50" 
                          : "border-gray-100 hover:border-gray-200"
                      }`}
                    >
                      <span className="text-2xl mb-2 block">{opt.icon}</span>
                      <p className="font-bold text-gray-900">{opt.label}</p>
                      <p className="text-xs text-emerald-600 font-bold">₹{opt.price}/page</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Copies */}
              <div className="space-y-3">
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Number of Copies</p>
                <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-2xl w-full">
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, copies: Math.max(1, prev.copies - 1) }))}
                    className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center font-bold text-xl active:scale-90 transition"
                  >
                    -
                  </button>
                  <div className="flex-1 text-center font-black text-2xl">{config.copies}</div>
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, copies: Math.min(50, prev.copies + 1) }))}
                    className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center font-bold text-xl active:scale-90 transition"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Advanced Toggles */}
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, duplex: !prev.duplex }))}
                  className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                    config.duplex 
                      ? "border-emerald-600 bg-emerald-50" 
                      : "border-gray-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.duplex ? "bg-emerald-200" : "bg-gray-100"}`}>
                      <span className="text-lg">📄</span>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-gray-900">Double-sided</p>
                      <p className="text-xs text-gray-500">Print on both sides of paper</p>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${config.duplex ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-300"}`}>
                    {config.duplex && <CheckCircle2 className="w-4 h-4" />}
                  </div>
                </button>
              </div>

              {/* Binding Options */}
              <div className="space-y-3">
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Binding (Optional)</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "none", label: "None", icon: "📄" },
                    { id: "spiral", label: "Spiral", icon: "🌀" },
                    { id: "soft", label: "Soft Cover", icon: "📕" }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setConfig(prev => ({ ...prev, binding: opt.id as PrintConfig["binding"] }))}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        config.binding === opt.id 
                          ? "border-emerald-600 bg-emerald-50" 
                          : "border-gray-100"
                      }`}
                    >
                      <span className="text-xl block mb-1">{opt.icon}</span>
                      <p className="font-bold text-gray-900 text-[10px] uppercase">{opt.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Price Summary Sticky */}
            <div className="bg-emerald-900 rounded-3xl p-6 shadow-2xl text-white">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-emerald-300 text-xs font-bold uppercase tracking-widest">Total Estimate</p>
                  <p className="text-4xl font-black">{formatCurrency(calculateTotal())}</p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-300 text-xs font-bold uppercase tracking-widest">Pages</p>
                  <p className="text-xl font-bold">{files.reduce((sum, f) => sum + f.pages, 0) * config.copies}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20 flex-1 py-6 rounded-2xl"
                  onClick={() => setCurrentStep("upload")}
                >
                  <ArrowLeft className="w-5 h-5 mr-2" /> Back
                </Button>
                <Button 
                  className="bg-white text-emerald-900 hover:bg-emerald-50 flex-[2] py-6 rounded-2xl font-black text-lg"
                  onClick={() => setCurrentStep("details")}
                >
                  Next: Checkout
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: DETAILS */}
        {currentStep === "details" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-3xl shadow-sm border p-8 space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-black text-gray-900">Your Details</h2>
                <p className="text-gray-500">Almost there! We just need a way to reach you.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Your Name</label>
                  <input 
                    type="text" 
                    placeholder="Enter your full name"
                    value={customer.name}
                    onChange={e => setCustomer(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-6 py-4 rounded-2xl border-2 border-gray-100 focus:border-emerald-600 focus:outline-none font-medium text-lg transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Phone Number</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 font-bold text-gray-400">+91</span>
                    <input 
                      type="tel" 
                      placeholder="9876543210"
                      maxLength={10}
                      value={customer.phone}
                      onChange={e => setCustomer(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                      className="w-full pl-16 pr-6 py-4 rounded-2xl border-2 border-gray-100 focus:border-emerald-600 focus:outline-none font-medium text-lg tracking-widest transition-all"
                    />
                  </div>
                  <p className="text-xs text-gray-400 ml-1 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> We&apos;ll send a 6-digit OTP to verify
                  </p>
                </div>
              </div>
            </div>

            <Button 
              className="w-full py-8 rounded-3xl text-xl font-black transition-all shadow-xl disabled:opacity-50"
              disabled={!customer.name || customer.phone.length < 10 || isSubmitting}
              onClick={sendOtp}
            >
              {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : "Verify & Place Order"}
            </Button>
            
            <button 
              onClick={() => setCurrentStep("config")}
              className="w-full text-center text-gray-400 font-bold text-sm hover:text-gray-600 transition"
            >
              Go back to print options
            </button>
          </div>
        )}

        {/* STEP 4: OTP */}
        {currentStep === "otp" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-3xl shadow-sm border p-8 space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-black text-gray-900">Verify OTP</h2>
                <p className="text-gray-500">Sent to +91 {customer.phone}</p>
              </div>

              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-6 py-6 rounded-2xl border-2 border-gray-100 focus:border-emerald-600 focus:outline-none font-black text-4xl text-center tracking-[1rem] transition-all"
                />
                
                <div className="text-center">
                  <button 
                    onClick={sendOtp}
                    className="text-sm font-bold text-emerald-600 hover:underline"
                  >
                    Resend OTP
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 rounded-2xl p-4 flex items-start gap-3 border border-amber-100">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  By clicking confirm, you agree to pay <span className="font-bold">{formatCurrency(calculateTotal())}</span> at the shop upon pickup. Please collect your prints within 48 hours.
                </p>
              </div>
            </div>

            <Button 
              className="w-full py-8 rounded-3xl text-xl font-black transition-all shadow-xl disabled:opacity-50 bg-emerald-600"
              disabled={otp.length < 6 || isSubmitting}
              onClick={verifyOtpAndSubmit}
            >
              {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : "Confirm Order"}
            </Button>
          </div>
        )}

        {/* STEP 5: SUCCESS */}
        {currentStep === "success" && orderResult && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            <div className="bg-white rounded-[2.5rem] shadow-2xl border-4 border-emerald-500/10 p-10 text-center relative overflow-hidden">
              {/* Decorative background elements */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-50 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-50 rounded-full blur-3xl" />
              
              <div className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-200">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              
              <h2 className="text-3xl font-black text-gray-900 mb-2">Order Placed!</h2>
              <p className="text-gray-500 font-medium mb-8">We&apos;ve sent your request to {shop?.shop_name}.</p>
              
              <div className="bg-gray-50 rounded-3xl p-6 mb-8 border border-dashed border-gray-200">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Your Order ID</p>
                <p className="text-3xl font-black text-emerald-600 tracking-tighter">#{orderResult.id.slice(0, 8).toUpperCase()}</p>
              </div>
              
              <div className="space-y-3">
                <Button 
                  className="w-full py-7 rounded-2xl text-lg font-black bg-gray-900 hover:bg-black transition-all shadow-xl"
                  onClick={() => router.push(`/order/${orderResult.token}`)}
                >
                  Track Status
                </Button>
                <p className="text-xs text-gray-400 font-medium">
                  Bookmark this page or save your Order ID to track your prints.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" /> Next Steps
              </h3>
              <ul className="space-y-4">
                {[
                  { icon: "📱", text: "Keep this tab open to see when it's ready." },
                  { icon: "🚶", text: "Head to the shop once status is 'Ready'." },
                  { icon: "💸", text: `Pay ${formatCurrency(calculateTotal())} at the counter.` }
                ].map((item, i) => (
                  <li key={i} className="flex gap-4 items-start">
                    <span className="text-xl shrink-0">{item.icon}</span>
                    <p className="text-sm text-gray-600 font-medium leading-tight pt-1">{item.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
