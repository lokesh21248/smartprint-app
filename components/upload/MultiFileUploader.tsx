"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { 
  FileText, Trash2, GripVertical, Plus, Minus, 
  CheckCircle2, AlertCircle, RefreshCw, Loader2, Image as ImageIcon 
} from "lucide-react";
import { toast } from "sonner";
import pLimit from "p-limit";
import * as tus from "tus-js-client";
import type { UploadedFile } from "@/types";

// Dynamic import for SSR safety
const MultiFileDropzone = dynamic(
  () => import("./MultiFileDropzone").then((m) => m.MultiFileDropzone),
  {
    ssr: false,
    loading: () => (
      <div className="h-44 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    ),
  }
);

export interface MultiFileUploaderRef {
  uploadAll: () => Promise<{ success: boolean; files: UploadedFile[] }>;
}

interface MultiFileUploaderProps {
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  shopId: string;
  orderId: string;
  disabled?: boolean;
}

export const MultiFileUploader = forwardRef<MultiFileUploaderRef, MultiFileUploaderProps>(
  ({ files, onChange, shopId, orderId, disabled = false }, ref) => {
    // PDF Page Count Parser
    const parsePdfPages = useCallback(async (file: File): Promise<{ count: number; failed: boolean }> => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const { PDFDocument } = await import("pdf-lib");
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        return { count: pdfDoc.getPageCount(), failed: false };
      } catch (err) {
        console.warn("[MultiFileUploader] PDF page count parse failed:", err);
        return { count: 1, failed: true };
      }
    }, []);

    // File Selection Handler
    const handleFilesSelected = useCallback(
      async (newFiles: File[]) => {
        if (disabled) return;

        const updatedList = [...files];
        let filesAdded = 0;

        for (const file of newFiles) {
          // 1. Hard validation limits check
          if (updatedList.length >= 20) {
            toast.error("Maximum 20 files allowed per order.");
            break;
          }

          // 2. Allowed file types
          const type = file.type.toLowerCase();
          const ext = file.name.split(".").pop()?.toLowerCase();
          const isAllowedType = 
            type === "application/pdf" || 
            type === "image/png" || 
            type === "image/jpeg" || 
            type === "image/jpg" ||
            ext === "pdf" || 
            ext === "png" || 
            ext === "jpg" || 
            ext === "jpeg";

          if (!isAllowedType) {
            toast.error(`"${file.name}" is not supported. Only PDF, PNG, JPG/JPEG files are accepted.`);
            continue;
          }

          // 3. Size check (25MB limit)
          if (file.size > 25 * 1024 * 1024) {
            toast.error(`"${file.name}" exceeds the 25MB size limit.`);
            continue;
          }

          // 4. Duplicate check (filename + size)
          const isDuplicate = updatedList.some(
            (f) => f.name === file.name && f.size === file.size
          );
          if (isDuplicate) {
            toast.warning(`"${file.name}" is already selected.`);
            continue;
          }

          const fileId = "file-" + Math.random().toString(36).slice(2, 11) + "-" + Date.now();
          const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");

          // Create base file object
          const newUploadedFile: UploadedFile = {
            id: fileId,
            file,
            name: file.name,
            size: file.size,
            pages: isPdf ? null : 1, // PDFs start as null, images are 1 page
            pdfParseFailed: false,
            progress: 0,
            status: "idle",
            copies: 1,
            color: false, // Default: B&W
            doubleSided: isPdf, // Default: 2-sided for PDF, false for image
          };

          updatedList.push(newUploadedFile);
          filesAdded++;

          // Parse PDF pages in background if PDF
          if (isPdf) {
            parsePdfPages(file).then(({ count, failed }) => {
              onChange(
                updatedList.map((f) =>
                  f.id === fileId ? { ...f, pages: count, pdfParseFailed: failed } : f
                )
              );
              if (failed) {
                toast.warning(`Couldn't detect pages in "${file.name}". Set manually.`);
              }
            });
          }
        }

        if (filesAdded > 0) {
          onChange(updatedList);
        }
      },
      [files, onChange, disabled, parsePdfPages]
    );

    // Remove File Handler
    const handleRemoveFile = useCallback(
      (id: string) => {
        if (disabled) return;
        onChange(files.filter((f) => f.id !== id));
      },
      [files, onChange, disabled]
    );

    // Update Print Config for Single File
    const handleUpdateConfig = useCallback(
      (id: string, updates: Partial<Pick<UploadedFile, "copies" | "color" | "doubleSided" | "pages">>) => {
        onChange(
          files.map((f) => (f.id === id ? { ...f, ...updates } : f))
        );
      },
      [files, onChange]
    );

    // TUS upload logic for a single file
    const uploadSingleFile = useCallback(
      async (fileItem: UploadedFile): Promise<UploadedFile> => {
        // Skip if already successfully uploaded (orphan recovery)
        if (fileItem.status === "success" && fileItem.storagePath) {
          return fileItem;
        }

        const updateState = (status: UploadedFile["status"], progress: number, extra: Partial<UploadedFile> = {}) => {
          onChange((prevFiles) =>
            prevFiles.map((f) =>
              f.id === fileItem.id ? { ...f, status, progress, ...extra } : f
            )
          );
        };

        try {
          let fileToUpload = fileItem.file;

          // 1. Image Compression (skip PDF, compress images at quality 0.82, max 1600px width/height)
          if (fileToUpload.type.startsWith("image/")) {
            updateState("compressing", 0);
            try {
              const { compressImageIfNeeded } = await import("@/lib/upload/compressImage");
              // sizeThresholdBytes = 0 ensures we always compress
              const compResult = await compressImageIfNeeded(fileToUpload, 0);
              if (compResult.compressed) {
                fileToUpload = compResult.file;
              }
            } catch (compressErr) {
              console.warn("[MultiFileUploader] Compression failed, uploading original:", compressErr);
            }
          }

          // 2. Generate Presigned URL & storagePath
          updateState("uploading", 0);
          const presignRes = await fetch("/api/storage/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shopId,
              fileName: fileToUpload.name,
              fileSize: fileToUpload.size,
              mimeType: fileToUpload.type,
              orderId, // Custom order-files/orders/{orderId}/{filename} structure
            }),
          });

          if (!presignRes.ok) {
            const errBody = await presignRes.json().catch(() => ({}));
            throw new Error(errBody.error || `Presign failed (${presignRes.status})`);
          }

          const { token, storagePath } = await presignRes.json();

          // 3. Perform direct TUS resumable upload
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          if (!supabaseUrl) {
            throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing in environment");
          }

          const endpoint = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;

          return new Promise<UploadedFile>((resolve, reject) => {
            const upload = new tus.Upload(fileToUpload, {
              endpoint,
              retryDelays: [0, 2000, 5000, 10000],
              headers: {
                "x-signature": token,
                "x-upsert": "true", // Enable overwriting/upsert
              },
              metadata: {
                bucketName: "order-files",
                objectName: storagePath,
                contentType: fileToUpload.type || "application/octet-stream",
              },
              chunkSize: 6 * 1024 * 1024, // Required: Must be exactly 6MB
              onError: (error) => {
                console.error("[MultiFileUploader] TUS upload error:", fileItem.name, error);
                updateState("failed", 0, { error: error.message });
                reject(error);
              },
              onProgress: (bytesSent, bytesTotal) => {
                const pct = Math.round((bytesSent / bytesTotal) * 100);
                updateState("uploading", pct);
              },
              onSuccess: () => {
                const result: UploadedFile = {
                  ...fileItem,
                  status: "success",
                  progress: 100,
                  storagePath,
                };
                // Sync the state
                onChange((prevFiles) =>
                  prevFiles.map((f) => (f.id === fileItem.id ? result : f))
                );
                resolve(result);
              },
            });

            upload.start();
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          updateState("failed", 0, { error: msg });
          throw err;
        }
      },
      [shopId, orderId, onChange]
    );

    // Multi-upload initiator (called by parent ref)
    useImperativeHandle(ref, () => ({
      async uploadAll() {
        if (files.length === 0) {
          toast.error("Please add at least one file.");
          return { success: false, files };
        }

        // Separate pending uploads (idle, failed) from already uploaded ones
        const pendingFiles = files.filter((f) => f.status !== "success");
        if (pendingFiles.length === 0) {
          return { success: true, files };
        }

        // p-limit: Concurrency threshold = 3 (avoid mobile crash)
        const limit = pLimit(3);
        const uploadPromises = files.map((fileItem) => {
          return limit(async () => {
            if (fileItem.status === "success" && fileItem.storagePath) {
              return fileItem;
            }
            // Transition status to retrying if it failed earlier
            if (fileItem.status === "failed") {
              onChange((prev) =>
                prev.map((f) => (f.id === fileItem.id ? { ...f, status: "retrying", progress: 0 } : f))
              );
            }
            return uploadSingleFile(fileItem);
          });
        });

        try {
          const results = await Promise.allSettled(uploadPromises);
          
          // Check if there are any failures
          const failures = results.filter((r) => r.status === "rejected");
          const successFiles: UploadedFile[] = [];
          
          results.forEach((r, idx) => {
            if (r.status === "fulfilled") {
              successFiles.push(r.value);
            }
          });

          if (failures.length > 0) {
            toast.error(`${failures.length} file upload(s) failed. You can retry them.`);
            return { success: false, files: successFiles };
          }

          return { success: true, files: successFiles };
        } catch (err) {
          console.error("[MultiFileUploader] Parallel upload error:", err);
          return { success: false, files };
        }
      },
    }));

    // Trigger individual file retry
    const handleRetryFile = useCallback(
      async (id: string) => {
        const fileItem = files.find((f) => f.id === id);
        if (!fileItem || disabled) return;

        onChange((prev) =>
          prev.map((f) => (f.id === id ? { ...f, status: "retrying", progress: 0 } : f))
        );

        try {
          await uploadSingleFile({ ...fileItem, status: "retrying", progress: 0 });
          toast.success(`"${fileItem.name}" uploaded successfully!`);
        } catch (err) {
          console.error("Single file retry failed:", err);
        }
      },
      [files, uploadSingleFile, onChange, disabled]
    );

    const formatSize = (bytes: number) => {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    return (
      <div className="space-y-6">
        {/* Dropzone area */}
        <div className={files.length >= 20 ? "opacity-50 pointer-events-none" : ""}>
          <MultiFileDropzone 
            onFilesSelected={handleFilesSelected} 
            disabled={disabled || files.length >= 20} 
          />
        </div>

        {/* Counter and info */}
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Selected Files ({files.length} / 20)
          </p>
          {files.length > 0 && !disabled && (
            <button
              onClick={() => onChange([])}
              className="text-xs font-extrabold text-red-500 hover:text-red-600 transition"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Reorderable Files List */}
        <Reorder.Group 
          values={files} 
          onReorder={onChange} 
          className="space-y-4"
          axis="y"
        >
          {files.map((fileItem) => (
            <ReorderItemRow 
              key={fileItem.id}
              fileItem={fileItem}
              disabled={disabled}
              onRemove={handleRemoveFile}
              onUpdateConfig={handleUpdateConfig}
              onRetry={handleRetryFile}
              formatSize={formatSize}
            />
          ))}
        </Reorder.Group>
      </div>
    );
  }
);

MultiFileUploader.displayName = "MultiFileUploader";

// Sub-component for individual file item row (supports custom drag handle controls)
function ReorderItemRow({
  fileItem,
  disabled,
  onRemove,
  onUpdateConfig,
  onRetry,
  formatSize,
}: {
  fileItem: UploadedFile;
  disabled: boolean;
  onRemove: (id: string) => void;
  onUpdateConfig: (id: string, updates: any) => void;
  onRetry: (id: string) => void;
  formatSize: (bytes: number) => string;
}) {
  const dragControls = useDragControls();
  const isPdf = fileItem.file.type === "application/pdf" || fileItem.name.endsWith(".pdf");

  // Local object URL for image preview (created once, revoked on unmount)
  const [thumbUrl, setThumbUrl] = useState<string>("");
  useEffect(() => {
    if (!isPdf) {
      const url = URL.createObjectURL(fileItem.file);
      setThumbUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [fileItem.file, isPdf]);

  return (
    <Reorder.Item
      value={fileItem}
      dragListener={false}
      dragControls={dragControls}
      className={`
        bg-white rounded-2xl border transition-all duration-200
        ${fileItem.status === "failed" ? "border-rose-200 bg-rose-50/10" : "border-slate-100 shadow-sm hover:shadow-md"}
      `}
    >
      <div className="p-4 flex gap-3 items-start">
        {/* Drag Handle */}
        <div 
          onPointerDown={(e) => !disabled && dragControls.start(e)}
          className={`h-12 flex items-center justify-center text-slate-300 px-1 ${
            disabled ? "cursor-not-allowed opacity-30" : "cursor-grab hover:text-slate-400 active:cursor-grabbing"
          }`}
        >
          <GripVertical className="w-4 h-4 shrink-0" />
        </div>

        {/* Thumbnail Preview */}
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
          {isPdf ? (
            <div className="w-full h-full bg-rose-50 flex flex-col items-center justify-center text-rose-500">
              <FileText className="w-6 h-6" />
              <span className="text-[7px] font-black uppercase tracking-widest mt-0.5">PDF</span>
            </div>
          ) : thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
              src={thumbUrl} 
              alt={fileItem.name} 
              className="w-full h-full object-cover" 
            />
          ) : (
            <ImageIcon className="w-5 h-5 text-slate-400" />
          )}
        </div>

        {/* File Metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-extrabold text-slate-800 truncate" title={fileItem.name}>
                {fileItem.name}
              </h4>
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">
                {formatSize(fileItem.size)} · {fileItem.pages !== null ? `${fileItem.pages} pgs` : "counting pages..."}
              </p>
            </div>
            
            {/* Delete button (only show when not submitting) */}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(fileItem.id)}
                className="w-7 h-7 rounded-lg hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Config Controls (hidden if uploading / success, or show simple read-only configs) */}
          {fileItem.status === "idle" || fileItem.status === "failed" ? (
            <div className="mt-3.5 pt-3 border-t border-slate-100/70 flex flex-wrap items-center gap-3.5">
              {/* Copies Picker */}
              <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => onUpdateConfig(fileItem.id, { copies: Math.max(1, fileItem.copies - 1) })}
                  disabled={disabled}
                  className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center transition disabled:opacity-40"
                >
                  <Minus className="w-3 h-3 text-slate-500" />
                </button>
                <span className="text-xs font-extrabold text-slate-700 min-w-4 text-center">
                  {fileItem.copies}
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateConfig(fileItem.id, { copies: Math.min(50, fileItem.copies + 1) })}
                  disabled={disabled}
                  className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center transition disabled:opacity-40"
                >
                  <Plus className="w-3 h-3 text-slate-600" />
                </button>
              </div>

              {/* Ink Mode */}
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => onUpdateConfig(fileItem.id, { color: false })}
                  disabled={disabled}
                  className={`px-3 py-1 rounded-md text-[10px] font-extrabold transition ${
                    !fileItem.color ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                  }`}
                >
                  B&amp;W
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateConfig(fileItem.id, { color: true })}
                  disabled={disabled}
                  className={`px-3 py-1 rounded-md text-[10px] font-extrabold transition ${
                    fileItem.color ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500"
                  }`}
                >
                  Color
                </button>
              </div>

              {/* Duplex/Sidedness (only for PDFs) */}
              {isPdf && (
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => onUpdateConfig(fileItem.id, { doubleSided: false })}
                    disabled={disabled}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition ${
                      !fileItem.doubleSided ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    1-Sided
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateConfig(fileItem.id, { doubleSided: true })}
                    disabled={disabled}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition ${
                      fileItem.doubleSided ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    2-Sided
                  </button>
                </div>
              )}

              {/* Manual Page Override (PDF parse failed Nudge) */}
              {fileItem.pdfParseFailed && (
                <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-100 rounded-xl p-0.5 ml-auto">
                  <span className="text-[9px] font-extrabold text-amber-700 uppercase tracking-wider pl-1.5">
                    Pages:
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateConfig(fileItem.id, { pages: Math.max(1, (fileItem.pages || 1) - 1) })}
                    disabled={disabled}
                    className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center transition disabled:opacity-40"
                  >
                    <Minus className="w-3 h-3 text-amber-600" />
                  </button>
                  <span className="text-xs font-black text-amber-900 min-w-4 text-center">
                    {fileItem.pages || 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateConfig(fileItem.id, { pages: Math.min(500, (fileItem.pages || 1) + 1) })}
                    disabled={disabled}
                    className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center transition disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3 text-amber-700" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            // Upload progress and status bars
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500 capitalize flex items-center gap-1.5">
                  {fileItem.status === "compressing" && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                      Compressing image…
                    </>
                  )}
                  {fileItem.status === "uploading" && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                      Uploading chunk…
                    </>
                  )}
                  {fileItem.status === "retrying" && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      Retrying upload…
                    </>
                  )}
                  {fileItem.status === "success" && (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Upload complete
                    </>
                  )}
                </span>
                
                {/* Percentage */}
                {fileItem.status === "uploading" && (
                  <span className="font-extrabold text-emerald-600">{fileItem.progress}%</span>
                )}
              </div>

              {/* Progress bar line */}
              {fileItem.status === "uploading" && (
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${fileItem.progress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Failure & Retry panel */}
          {fileItem.status === "failed" && (
            <div className="mt-2.5 flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              <span className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Upload failed.
              </span>
              <button
                type="button"
                onClick={() => onRetry(fileItem.id)}
                disabled={disabled}
                className="inline-flex items-center gap-1 text-[10px] font-black text-rose-800 hover:text-rose-950 uppercase tracking-wider hover:underline"
              >
                <RefreshCw className="w-3 h-3 shrink-0" />
                Retry file
              </button>
            </div>
          )}
        </div>
      </div>
    </Reorder.Item>
  );
}
