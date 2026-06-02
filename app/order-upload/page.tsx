"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Loader2,
  FileText,
  User,
  ShieldCheck,
  Clock,
  Printer,
  ChevronRight,
  Phone,
  ArrowLeft,
  WifiOff,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { UploadProgressBar } from "@/components/upload/UploadProgressBar";
import type { UploadPhase } from "@/components/upload/UploadProgressBar";
import { fetchWithRetry } from "@/lib/utils/fetchWithRetry";
import { createOrderTracker } from "@/lib/monitoring/orderMetrics";
import type { UploadedFile, FileSecurityStatus } from "@/types";
import { createClient } from "@/lib/supabase/client";
import type { MultiFileUploaderRef } from "@/components/upload/MultiFileUploader";
import { Scan2PaperLogo } from "@/components/shared/Scan2PaperLogo";

// Dynamic import for MultiFileUploader to ensure SSR safety
const MultiFileUploader = dynamic(
  () => import("@/components/upload/MultiFileUploader").then((m) => m.MultiFileUploader),
  {
    ssr: false,
    loading: () => (
      <div className="h-44 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    ),
  }
);

interface ShopDisplay {
  id?: string;
  name?: string;
  address?: string;
  phone?: string;
  is_open?: boolean;
  price_bw_per_page?: number;
  price_color_per_page?: number;
}

// ─── Generate idempotency key ─────────────────────────────────────────────────
function generateIdempotencyKey(shopId: string, phone: string, fileNames: string): string {
  return `${shopId}:${phone}:${fileNames}:${Date.now().toString(36)}`;
}

// ─── Sanitize filename on client to match backend ──────────────────────────────
function sanitizeFileName(raw: string): string {
  const lastDotIdx = raw.lastIndexOf(".");
  const hasExt = lastDotIdx > 0;
  const baseName = hasExt ? raw.slice(0, lastDotIdx) : raw;
  const extension = hasExt ? raw.slice(lastDotIdx).toLowerCase() : "";

  let clean = baseName
    .replace(/[\s\t]+/g, "_")
    .replace(/[^a-zA-Z0-9\-_.]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/_{2,}/g, "_")
    .replace(/^[._]+|[._]+$/g, "");

  if (clean.length > 100) {
    clean = clean.slice(0, 100);
  }

  if (clean.length === 0) {
    clean = "upload";
  }

  return clean + extension;
}

// ─── Memoized Pricing Summary Card ──────────────────────────────────────────
const PricingSummaryCard = memo(function PricingSummaryCard({
  totalAmount,
  filesCount,
  totalPages,
  totalCopies,
  onCheckout,
  disabled,
}: {
  totalAmount: number;
  filesCount: number;
  totalPages: number;
  totalCopies: number;
  onCheckout: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-slate-900 rounded-3xl p-5 sm:p-6 md:p-8 text-white flex flex-row items-center justify-between gap-4 shadow-2xl relative overflow-hidden fixed bottom-4 left-4 right-4 z-40 md:relative md:bottom-auto md:left-auto md:right-auto md:m-0"
    >
      <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 opacity-5">
        <Printer className="w-40 h-40" />
      </div>

      <div className="z-10 flex flex-col justify-center min-w-0">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
          Estimated Cost
        </span>
        <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 leading-none">
          {formatCurrency(totalAmount)}
        </p>
        <p className="text-[9px] sm:text-[10px] text-slate-300 font-bold mt-1.5 truncate">
          {filesCount} {filesCount === 1 ? "file" : "files"} · {totalPages} {totalPages === 1 ? "page" : "pages"} · {totalCopies} {totalCopies === 1 ? "copy" : "copies"}
        </p>
      </div>

      <Button
        onClick={onCheckout}
        disabled={disabled}
        className="px-5 sm:px-8 h-12 sm:h-14 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center gap-1.5 transition active:scale-[0.98] z-10 shadow-lg shadow-emerald-500/20 shrink-0 text-xs sm:text-sm disabled:opacity-50 disabled:pointer-events-none"
      >
        Checkout <ChevronRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
});

// ─── Memoized Checkout Bar Card ─────────────────────────────────────────────
const CheckoutBarCard = memo(function CheckoutBarCard({
  totalAmount,
  filesCount,
  totalPages,
  totalCopies,
  orderStatus,
  uploadPhase,
  overallUploadPercent,
  isOffline,
  customerName,
  customerPhone,
  canRetry,
  onPlaceOrder,
  showProgress,
  allFilesCompleted,
}: {
  totalAmount: number;
  filesCount: number;
  totalPages: number;
  totalCopies: number;
  orderStatus: string;
  uploadPhase: UploadPhase;
  overallUploadPercent: number;
  isOffline: boolean;
  customerName: string;
  customerPhone: string;
  canRetry: boolean;
  onPlaceOrder: () => void;
  showProgress: boolean;
  allFilesCompleted: boolean;
}) {
  return (
    <div className="bg-slate-900 rounded-3xl p-5 sm:p-6 md:p-8 text-white flex flex-col gap-5 sm:gap-6 shadow-2xl shadow-slate-950/20 relative overflow-hidden fixed bottom-4 left-4 right-4 z-40 md:relative md:bottom-auto md:left-auto md:right-auto md:m-0">
      <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 opacity-5">
        <Printer className="w-40 h-40" />
      </div>

      <div className="flex flex-row items-center justify-between gap-4 z-10">
        <div className="flex flex-col justify-center min-w-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            Total Print Bill
          </span>
          <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 leading-none">
            {formatCurrency(totalAmount)}
          </p>
          <p className="text-[9px] sm:text-[10px] text-slate-300 font-bold mt-1.5 truncate">
            {filesCount} {filesCount === 1 ? "file" : "files"} · {totalPages} {totalPages === 1 ? "page" : "pages"} · {totalCopies} {totalCopies === 1 ? "copy" : "copies"}
          </p>
        </div>

        <Button
          id="place-order-btn"
          onClick={onPlaceOrder}
          disabled={
            orderStatus === "saving" ||
            orderStatus === "success" ||
            !allFilesCompleted ||
            isOffline ||
            !customerName ||
            customerName.trim().length < 3 ||
            customerPhone.length < 10 ||
            filesCount === 0
          }
          className={`px-5 sm:px-8 py-3 sm:py-4 h-12 sm:h-14 rounded-xl font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none z-10 shrink-0 text-xs sm:text-sm ${
            canRetry
              ? "bg-amber-500 hover:bg-amber-600 text-white"
              : "bg-emerald-500 hover:bg-emerald-600 text-white"
          }`}
        >
          {orderStatus === "success" ? (
            <>
              <Loader2 className="animate-spin w-4 h-4" />
              Redirecting…
            </>
          ) : uploadPhase === "compressing" ? (
            <>
              <Loader2 className="animate-spin w-4 h-4" />
              Compressing…
            </>
          ) : uploadPhase === "uploading" ? (
            <>
              <Loader2 className="animate-spin w-4 h-4" />
              Uploading ({overallUploadPercent}%)…
            </>
          ) : orderStatus === "saving" ? (
            <>
              <Loader2 className="animate-spin w-4 h-4" />
              Finalizing…
            </>
          ) : orderStatus === "failed" ? (
            <>
              <RefreshCw className="w-4 h-4" /> Retry
            </>
          ) : (
            <>
              Place Order <ChevronRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>

      {showProgress && (
        <div className="border-t border-slate-800/80 pt-5 mt-1 z-10">
          <UploadProgressBar
            phase={uploadPhase}
            uploadPercent={overallUploadPercent}
            fileCount={filesCount}
          />
        </div>
      )}
    </div>
  );
});

// ─── Inner Page Component ─────────────────────────────────────────────────────
function OrderUploadPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shopSlug = searchParams.get("shopSlug");
  const nameParam = searchParams.get("name") ?? "";

  // ── State ──────────────────────────────────────────────────────────────────
  const [shop, setShop] = useState<ShopDisplay | null>(null);
  const [isLoadingShop, setIsLoadingShop] = useState(true);
  const [step, setStep] = useState(1); // Step 1: Upload & Config, Step 2: Checkout Info
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploaderResetKey] = useState(() => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
  });
  const [notes, setNotes] = useState("");

  // Pre-generate unique orderId for this session (for TUS folder structuring)
  const [orderId] = useState(() => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "f" + Math.random().toString(36).substring(2, 15) + "-" + Date.now();
  });

  // Submission state
  type OrderStatus = "idle" | "saving" | "success" | "failed";
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const handleCheckoutDetails = useCallback(() => {
    setStep(2);
  }, []);

  const isSubmitting = orderStatus === "saving" || orderStatus === "success";
  const canRetry = orderStatus === "failed";

  const uploadPhase = useMemo<UploadPhase>(() => {
    if (orderStatus === "success") return "success";
    if (files.some((f) => f.status === "uploading" || f.status === "queued" || f.status === "preparing" || f.status === "verifying")) return "uploading";
    if (orderStatus === "saving") return "saving";
    return "idle";
  }, [orderStatus, files]);

  // Refs — these survive re-renders without causing them
  const isSubmittingRef = useRef(false);
  const uploaderRef = useRef<MultiFileUploaderRef>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const persistUploadRef = useRef(false);

  const { user, isLoaded } = useUser();
  const [customerName, setCustomerName] = useState(nameParam);
  const [customerPhone, setCustomerPhone] = useState("");

  // ── Clerk prefill ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoaded && user) {
      if (!nameParam && user.fullName) setCustomerName(user.fullName);
      if (user.primaryPhoneNumber) setCustomerPhone(user.primaryPhoneNumber.phoneNumber);
    }
  }, [isLoaded, user, nameParam]);

  // ── Network detection + auto-retry guidance ────────────────────────────────
  useEffect(() => {
    const onOffline = () => {
      setIsOffline(true);
      toast.error("You're offline — uploads paused. Will resume automatically when reconnected.");
    };
    const onOnline = () => {
      setIsOffline(false);
      const failedFiles = files.filter((f) => f.status === "failed" || f.status === "cancelled");
      if (failedFiles.length > 0) {
        toast.success(`Back online! Auto-retrying ${failedFiles.length} failed upload${failedFiles.length > 1 ? "s" : ""}…`);
      } else {
        toast.success("Back online!");
      }
    };

    setIsOffline(!navigator.onLine);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    const clearUploadSession = () => {
      if (persistUploadRef.current) {
        console.log("[order-upload] Preserving upload queue for status page redirection.");
        return;
      }
      try {
        uploaderRef.current?.cancelAll();
        uploaderRef.current?.clear();
      } catch (e) {
        console.warn("Failed to clear upload session on unload/unmount:", e);
      }
    };

    window.addEventListener("beforeunload", clearUploadSession);

    return () => {
      window.removeEventListener("beforeunload", clearUploadSession);
      clearUploadSession();
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── Invalidate idempotency key on changes ──────────────────────────────────
  const orderConfigSignature = useMemo(() => {
    const fileSpecs = files.map((f) => `${f.id}:${f.copies}:${f.color}:${f.doubleSided}`).join(";");
    return `${customerName}|${customerPhone}|${notes}|${fileSpecs}`;
  }, [files, customerName, customerPhone, notes]);

  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [orderConfigSignature]);

  // ── Load shop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shopSlug) {
      toast.error("Invalid URL: Shop missing");
      router.replace("/");
      return;
    }

    const loadShop = async () => {
      try {
        const res = await fetch(`/api/shop/public?slug=${encodeURIComponent(shopSlug)}`);
        if (!res.ok) {
          toast.error("Shop not found or unavailable");
          router.replace("/");
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
  }, [shopSlug, router]);

  // ── Aggregated Price and Volume Calculations ──────────────────────────────
  const totalAmount = useMemo(() => {
    if (!shop || files.length === 0) return 0;
    return files
      .filter((f) => f.status !== "failed" && f.status !== "cancelled")
      .reduce((sum, f) => {
        const rate = f.color
          ? (shop.price_color_per_page || 0)
          : (shop.price_bw_per_page || 0);
        return sum + (f.pages || 1) * f.copies * rate;
      }, 0);
  }, [files, shop]);

  const totalPages = useMemo(() => {
    return files
      .filter((f) => f.status !== "failed" && f.status !== "cancelled")
      .reduce((sum, f) => sum + (f.pages || 1), 0);
  }, [files]);

  const totalCopies = useMemo(() => {
    return files
      .filter((f) => f.status !== "failed" && f.status !== "cancelled")
      .reduce((sum, f) => sum + f.copies, 0);
  }, [files]);



  // Dynamic overall upload percentage based on files sizes & progress
  const overallUploadPercent = useMemo(() => {
    if (files.length === 0) return 0;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize === 0) return 0;
    const uploadedBytes = files.reduce((sum, f) => {
      const pct = (f.status === "completed" || f.status === "verifying") ? 100 : f.progress;
      return sum + f.size * (pct / 100);
    }, 0);
    return Math.round((uploadedBytes / totalSize) * 100);
  }, [files]);

  const allFilesCompleted = useMemo(() => {
    return files.length > 0 && files.every((f) => f.status === "completed");
  }, [files]);

  // ── Core submit handler ────────────────────────────────────────────────────
  const handlePlaceOrder = useCallback(async () => {
    if (files.length === 0 || !shop?.id) return;

    if (isSubmittingRef.current) {
      console.warn("[order] double-submit blocked");
      return;
    }

    // Input Validation
    if (!customerName || customerName.trim().length < 3) {
      toast.error("Please enter your name");
      return;
    }
    const rawDigits = customerPhone.replace(/\D/g, "");
    const cleanedPhone =
      rawDigits.length === 12 && rawDigits.startsWith("91")
        ? rawDigits.slice(2)
        : rawDigits;
    if (cleanedPhone.length !== 10) {
      toast.error("Enter valid 10-digit phone number");
      return;
    }

    if (isOffline) {
      toast.error("You're offline. Please reconnect and try again.");
      return;
    }


    const formattedName = customerName
      .trim()
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    // Set up submission state
    isSubmittingRef.current = true;
    setOrderStatus("saving");
    setErrorMessage(null);

    const tracker = createOrderTracker(shop.id);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 60-second timeout for multiple files
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60_000);

    // Generate unique idempotency key
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey(
        shop.id,
        cleanedPhone,
        files.map((f) => f.name).join(",")
      );
    }

    try {
      // Kick off background uploads if not already active
      uploaderRef.current?.retryFailed?.();

      // ── Step 2: Save order metadata to DB ───────────────────────────────────
      tracker.markInsertStart();

      // Debug: verify copies/color/doubleSided are captured correctly at checkout time
      console.log("[OrderUpload] Files state at checkout:", files.map(f => ({
        name: f.name,
        copies: f.copies,
        color: f.color,
        doubleSided: f.doubleSided,
        pages: f.pages,
        status: f.status,
      })));

      // Structure files array for backend schema validator using precalculated permanent S3 paths
      const filesPayload = files.map((f) => {
        const sanitized = sanitizeFileName(f.name);
        const calculatedPath = `orders/${orderId}/${sanitized}`;
        return {
          name: f.name,
          size: f.size,
          pages: f.pages || 1,
          url: calculatedPath,
          copies: f.copies || 1,
          color: f.color || false,
          doubleSided: f.doubleSided || false,
          mimeType: f.mimeType || f.file?.type || "application/octet-stream",
          scanStatus: f.scanStatus || "pending",
          securityStatus: f.securityStatus || "pending",
        };
      });

      // Construct request body (supporting relational array + single file fallback)
      const orderBody = JSON.stringify({
        id: orderId,
        shopId: shop.id,
        // Legacy fields mapping (using the first file in the array)
        filePath: filesPayload[0].url,
        fileName: filesPayload[0].name,
        fileSize: filesPayload[0].size,
        pageCount: filesPayload[0].pages,
        copies: filesPayload[0].copies,
        color: filesPayload[0].color,
        doubleSided: filesPayload[0].doubleSided,
        notes: notes?.trim() || "",
        customerName: formattedName,
        customerPhone: cleanedPhone,
        // Multi-file array
        files: filesPayload,
      });

      const res = await fetchWithRetry(
        "/api/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idempotencyKeyRef.current
              ? { "x-idempotency-key": idempotencyKeyRef.current }
              : {}),
          },
          body: orderBody,
          signal: controller.signal,
        },
        {
          maxRetries: 2,
          baseDelayMs: 600,
          signal: controller.signal,
          onRetry: (attempt) => {
            tracker.incrementRetry();
            toast.info(`Retrying… (attempt ${attempt + 1})`);
          },
        }
      );

      tracker.markInsertEnd();

      const raw = await res.text();
      let data: { success?: boolean; shortToken?: string; error?: string; message?: string };
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("Server returned invalid response");
      }

      if (res.ok && data.shortToken) {
        setOrderStatus("success");
        tracker.markSuccess();
        persistUploadRef.current = true;
        router.push(`/order/${data.shortToken}`);
      } else {
        throw new Error(data.message || data.error || "Order creation failed");
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      let userMessage: string;
      if (isAbort) {
        userMessage = "Request timed out. Successfully uploaded files are saved — tap Retry to complete your order.";
        tracker.markFailure("timeout");
      } else if (!navigator.onLine) {
        userMessage = "You went offline. Reconnect and tap Retry.";
        tracker.markFailure("network");
      } else {
        userMessage =
          err instanceof Error
            ? err.message.replace(/^Error:\s*/, "")
            : "Something went wrong placing your order.";
        tracker.markFailure("unknown");
      }

      console.error("[order] submission failed:", err);
      setErrorMessage(userMessage);
      setOrderStatus("failed");
      toast.error("Please review the errors below to complete your order.");

      // Do NOT clear uploader session or reset files list on failure. 
      // This preserves files so they remain on screen for retries and prevents total amount from becoming 0.
    } finally {
      clearTimeout(timeoutId);
      isSubmittingRef.current = false;
    }
  }, [files, shop, customerName, customerPhone, isOffline, notes, router]);

  // Loading Screen
  if (isLoadingShop) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB]">
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute w-20 h-20 rounded-full border-4 border-emerald-500/10 border-t-emerald-500 animate-spin" />
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600">
            <Printer className="w-6 h-6 animate-pulse" />
          </div>
        </div>
        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
          Loading Scan2Paper...
        </p>
      </div>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className={`min-h-screen bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-50 via-slate-50 to-white font-sans antialiased font-medium text-slate-800 transition-all ${files.length > 0 ? "pb-36 md:pb-24" : "pb-24"}`}>
      {/* Offline Banner */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500 text-white overflow-hidden"
          >
            <div className="max-w-2xl mx-auto px-6 py-2.5 flex items-center gap-2 text-sm font-bold">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>You&apos;re offline — connect to place your order</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky Header */}
      <div className="bg-white/70 backdrop-blur-md border-b border-slate-100/80 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="p-2 hover:bg-slate-100 rounded-xl transition"
                disabled={isSubmitting}
              >
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
            )}
            {step === 1 && (
              <Scan2PaperLogo variant="icon" size={28} color="color" />
            )}
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
                {shop?.name}
              </h1>
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
          {/* STEP 1: Multiple File Upload & Config */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="space-y-4 md:space-y-6"
            >
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-xl shadow-slate-900/[0.02] p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 min-h-[220px] sm:min-h-[300px] h-auto flex flex-col justify-start">
                <MultiFileUploader
                  key={uploaderResetKey}
                  ref={uploaderRef}
                  files={files}
                  onChange={setFiles}
                  shopId={shop?.id || ""}
                  orderId={orderId}
                  disabled={isSubmitting}
                />
              </div>

              {files.length > 0 && (
                <PricingSummaryCard
                  totalAmount={totalAmount}
                  filesCount={files.length}
                  totalPages={totalPages}
                  totalCopies={totalCopies}
                  onCheckout={handleCheckoutDetails}
                  disabled={isSubmitting || !allFilesCompleted}
                />
              )}

              <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-100 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">Same-Day Counter Pickup</h3>
                  <p className="text-slate-500 text-xs font-medium">
                    Customize your documents, upload, and collect them immediately at the counter.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Customer Details & Order Placement */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="space-y-4 md:space-y-6"
            >
              {/* Order Document Review List */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-3 sm:space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">
                  Review Files ({files.length})
                </h3>
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
                  {files.map((fileItem) => (
                    <div key={fileItem.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          fileItem.file?.type === "application/pdf" || fileItem.name.endsWith(".pdf")
                            ? "bg-rose-50 border-rose-100 text-rose-500"
                            : "bg-emerald-50 border-emerald-100 text-emerald-500"
                        }`}>
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-extrabold text-slate-700 truncate" title={fileItem.name}>
                            {fileItem.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                            {formatSize(fileItem.size)} · {fileItem.pages || 1} pgs · {fileItem.copies} copies
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-extrabold uppercase">
                          {fileItem.color ? "Color" : "B&W"}
                        </span>
                        {(fileItem.file?.type === "application/pdf" || fileItem.name.endsWith(".pdf")) && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-extrabold uppercase">
                            {fileItem.doubleSided ? "2-Sided" : "1-Sided"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Info */}
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-xl shadow-slate-900/[0.02] p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-inner">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Delivery Info</h2>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      Your contact details for pickups
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">
                      Full Name
                    </label>
                    <div className="relative group">
                      <User className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      <input
                        id="customer-name"
                        placeholder="Enter your name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        disabled={isSubmitting}
                        className="w-full pl-12 h-12 rounded-xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm font-semibold transition-all disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">
                      WhatsApp / Phone Number
                    </label>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      <input
                        id="customer-phone"
                        placeholder="10-digit mobile number"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        disabled={isSubmitting}
                        className="w-full pl-12 h-12 rounded-xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm font-semibold transition-all disabled:opacity-60"
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 font-bold ml-0.5">
                      Used strictly for real-time status &amp; pickup updates
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-xl shadow-slate-900/[0.02] p-4 sm:p-6 md:p-8 space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">
                  Special Instructions (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="E.g. Staple top-left, spiral binding requested..."
                  className="w-full bg-slate-50/50 rounded-2xl p-4 text-sm border border-slate-100 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none min-h-[90px] transition-all placeholder:text-slate-400"
                  disabled={isSubmitting}
                />
              </div>

              {/* Error / Retry Banner */}
              <AnimatePresence>
                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={
                      errorMessage.toLowerCase().includes("infected")
                        ? "bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3"
                        : "bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3"
                    }
                  >
                    <AlertCircle className={
                      errorMessage.toLowerCase().includes("infected")
                        ? "w-5 h-5 text-red-500 shrink-0 mt-0.5"
                        : "w-5 h-5 text-amber-500 shrink-0 mt-0.5"
                    } />
                    <div className="flex-1 min-w-0">
                      {errorMessage.toLowerCase().includes("infected") ? (
                        <>
                          <p className="text-sm font-bold text-red-700">Security Scan Flagged File</p>
                          <p className="text-xs text-red-600 mt-1">
                            One or more of your files has been flagged as infected. Order submission is blocked for security reasons.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-bold text-amber-800">
                            {errorMessage.includes("Security validation failed")
                              ? "Security scan in progress."
                              : errorMessage}
                          </p>
                          {errorMessage.includes("Security validation failed") && (
                            <p className="text-xs text-amber-700 mt-1">
                              Your files uploaded successfully. Order submission will continue automatically.
                            </p>
                          )}
                          <p className="text-[10px] text-amber-600 font-bold mt-1.5">
                            ✓ Successfully uploaded files are saved — only the order save will retry.
                          </p>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Checkout Bar with integrated Progress Bar */}
              <CheckoutBarCard
                totalAmount={totalAmount}
                filesCount={files.length}
                totalPages={totalPages}
                totalCopies={totalCopies}
                orderStatus={orderStatus}
                uploadPhase={uploadPhase}
                overallUploadPercent={overallUploadPercent}
                isOffline={isOffline}
                customerName={customerName}
                customerPhone={customerPhone}
                canRetry={canRetry}
                onPlaceOrder={handlePlaceOrder}
                showProgress={isSubmitting}
                allFilesCompleted={allFilesCompleted}
              />

              {/* Help Support */}
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
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <OrderUploadPageInner />
    </Suspense>
  );
}
