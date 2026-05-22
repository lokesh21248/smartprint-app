"use client";

/**
 * ModernUploaderV2 — premium FilePond-powered upload zone for SmartPrint.
 *
 * ARCHITECTURE (safe, production-grade):
 * ─────────────────────────────────────────────────────────────────
 * Customer UI
 *   └─ ModernUploaderV2 (this component)
 *       └─ FilePondDropzone (dynamically imported, ssr: false)
 *           └─ <FilePond> (file picker / drag-drop / preview)
 *   └─ FilePreviewCard (selected file details + progress)
 *
 * FilePond is ONLY used as:
 *   - File picker / drag-drop UI
 *   - Client-side validation UI
 *   - Visual feedback layer
 *
 * FilePond's built-in server upload is DISABLED.
 * All upload logic goes through the existing flow:
 *   POST /api/storage/presign → PUT Supabase → POST /api/orders
 * ─────────────────────────────────────────────────────────────────
 *
 * SSR safety: FilePond CSS + JS are dynamically imported with ssr:false.
 * This prevents hydration mismatch in Next.js App Router.
 *
 * @module components/upload/ModernUploaderV2
 */

import dynamic from "next/dynamic";
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, ArrowRight, Loader2, RotateCcw, Camera, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { validateFileClient } from "@/lib/upload/fileValidation";
import { FilePreviewCard } from "@/components/upload/FilePreviewCard";
import type { UploadStatus } from "@/hooks/useSafeFileUpload";

// ─── Dynamic import — SSR:false is MANDATORY for FilePond ─────────────────────
// FilePond accesses browser APIs (File, DataTransfer, etc.) at module load time.
// Without ssr:false this causes a hydration crash in Next.js App Router.

const FilePondDropzone = dynamic(
  () => import("./FilePondDropzone").then((m) => m.FilePondDropzone),
  {
    ssr: false,
    loading: () => (
      <div className="h-44 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    ),
  }
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileReadyPayload {
  file: File;
  pageCount: number | null;
  pdfParseFailed: boolean;
}

export interface ModernUploaderV2Props {
  /** Called when a file is validated + page count parsed — ready for order flow. */
  onFileReady: (payload: FileReadyPayload) => void;
  /** Called when the user removes the selected file. */
  onFileRemoved: () => void;
  /** Used for display only — shopId is passed to the page's existing presign call. */
  shopId?: string;
  /** Disable interaction (e.g. while order is submitting). */
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ModernUploaderV2({
  onFileReady,
  onFileRemoved,
  disabled = false,
}: ModernUploaderV2Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfParseFailed, setPdfParseFailed] = useState(false);
  const [uploadStatus] = useState<UploadStatus>("idle");

  // Ref to FilePond instance for imperative reset
  const pondResetRef = useRef<(() => void) | null>(null);

  // Photo / image camera input ref
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── PDF page count parser ─────────────────────────────────────────────────
  const parsePdfPages = useCallback(async (file: File): Promise<{ count: number | null; failed: boolean }> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      return { count: pdfDoc.getPageCount(), failed: false };
    } catch (err) {
      console.warn("[ModernUploaderV2] PDF parse failed:", err);
      return { count: 1, failed: true };
    }
  }, []);

  // ── Core file handler — called by FilePond + direct inputs ───────────────
  const handleFileSelected = useCallback(async (file: File) => {
    if (disabled) return;

    // 1. Client-side validation (mirrors server exactly)
    const validation = validateFileClient(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setSelectedFile(file);
    setPdfParseFailed(false);
    setPageCount(null);

    let pages: number | null = null;
    let parseFailed = false;

    // 2. PDF page count parsing
    if (validation.category === "pdf") {
      setIsParsingPdf(true);
      try {
        const result = await parsePdfPages(file);
        pages = result.count;
        parseFailed = result.failed;
        setPageCount(pages);
        setPdfParseFailed(parseFailed);
        if (!parseFailed) {
          toast.success(`${pages} ${pages === 1 ? "page" : "pages"} detected`);
        } else {
          toast.warning("Couldn't auto-detect pages — you can set them manually.");
        }
      } finally {
        setIsParsingPdf(false);
      }
    } else {
      // Images: no page count needed
      setPageCount(1);
      pages = 1;
    }

    // 3. Notify parent — parent calls its own presign + order flow
    onFileReady({ file, pageCount: pages, pdfParseFailed: parseFailed });
  }, [disabled, parsePdfPages, onFileReady]);

  // ── Remove handler ────────────────────────────────────────────────────────
  const handleRemove = useCallback(() => {
    setSelectedFile(null);
    setPageCount(null);
    setPdfParseFailed(false);
    setIsParsingPdf(false);
    pondResetRef.current?.();
    onFileRemoved();
  }, [onFileRemoved]);

  // ── Camera / image quick-select handlers ─────────────────────────────────
  const handleNativeInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset input so same file can be re-selected
      e.target.value = "";
      handleFileSelected(file);
    },
    [handleFileSelected]
  );

  return (
    <div className="space-y-4">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
          Upload Documents & Photos
        </h2>
        <p className="text-slate-500 text-sm font-medium leading-relaxed">
          Upload PDFs, notes, assignments or take photos instantly.
        </p>
      </div>

      {/* ── Privacy badge ─────────────────────────────────────────────────── */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full">
        <ShieldCheck className="w-3 h-3 text-emerald-600" />
        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
          Auto Delete Privacy Active
        </span>
      </div>

      {/* ── FilePond drop zone (only shown when no file selected) ─────────── */}
      <AnimatePresence mode="wait">
        {!selectedFile && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <FilePondDropzone
              onFileSelected={handleFileSelected}
              onResetRef={(resetFn) => { pondResetRef.current = resetFn; }}
              disabled={disabled}
            />
          </motion.div>
        )}

        {/* ── File preview card (shown when file is selected) ──────────── */}
        {selectedFile && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <FilePreviewCard
              file={selectedFile}
              pageCount={pageCount}
              status={isParsingPdf ? "presigning" : uploadStatus}
              progress={0}
              onRemove={handleRemove}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quick action buttons ──────────────────────────────────────────── */}
      {!selectedFile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          {/* PDF — opens OS file picker filtered to PDF */}
          <QuickActionButton
            icon={<FileText className="w-4 h-4" />}
            label="Upload PDF"
            accent="rose"
            disabled={disabled}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "application/pdf,.pdf";
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFileSelected(file);
              };
              input.click();
            }}
          />

          {/* Camera — triggers device camera directly on mobile */}
          <QuickActionButton
            icon={<Camera className="w-4 h-4" />}
            label="Take Photo"
            accent="violet"
            disabled={disabled}
            onClick={() => cameraInputRef.current?.click()}
          />

          {/* Images — gallery picker */}
          <QuickActionButton
            icon={<ImageIcon className="w-4 h-4" />}
            label="Gallery"
            accent="amber"
            disabled={disabled}
            onClick={() => imageInputRef.current?.click()}
          />
        </motion.div>
      )}

      {/* Hidden native inputs for camera + gallery */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleNativeInputChange}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        className="hidden"
        onChange={handleNativeInputChange}
      />

      {/* ── PDF parse failed — manual page count nudge ────────────────────── */}
      <AnimatePresence>
        {pdfParseFailed && selectedFile && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs font-semibold text-amber-800">
                Page count couldn&apos;t be auto-detected. Set it manually on the
                next screen.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CTA: Continue (shown when file ready + not uploading) ─────────── */}
      <AnimatePresence>
        {selectedFile && !isParsingPdf && uploadStatus === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
              <ArrowRight className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-bold text-emerald-800">
                File ready — configure print settings below.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── QuickActionButton ────────────────────────────────────────────────────────

const ACCENT_STYLES = {
  rose: "bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100 active:scale-95",
  violet: "bg-violet-50 text-violet-600 border-violet-100 hover:bg-violet-100 active:scale-95",
  amber: "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100 active:scale-95",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100 active:scale-95",
} as const;

function QuickActionButton({
  icon,
  label,
  accent,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  accent: keyof typeof ACCENT_STYLES;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center gap-2
        border rounded-2xl py-4 px-2 transition-all duration-150
        font-bold text-[11px] tracking-wide
        disabled:opacity-40 disabled:pointer-events-none
        ${ACCENT_STYLES[accent]}
      `}
    >
      <div className="w-9 h-9 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
        {icon}
      </div>
      {label}
    </button>
  );
}
