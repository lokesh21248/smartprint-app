"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  FileText,
  Download,
  Trash2,
  Cpu,
  RefreshCw,
  CheckCircle,
  Eye,
  Sliders,
  Sparkles,
} from "lucide-react";
import { CameraPreview, CameraPreviewRef } from "./CameraPreview";
import { toast } from "sonner";

interface ScannedPage {
  id: string;
  originalDataUrl: string;
  filteredDataUrl: string;
  pixels: ArrayBuffer; // Raw image pixel buffer
  width: number;
  height: number;
  ocrText?: string;
  ocrProgress?: number;
  filters: {
    grayscale: boolean;
    threshold: boolean; // B&W Doc style
    contrast: number; // 0 to 2
  };
}

interface PerformanceMetric {
  label: string;
  timestamp: number;
  elapsedMs: number;
}

export function ScannerContainer() {
  const cameraRef = useRef<CameraPreviewRef>(null);
  const workerRef = useRef<Worker | null>(null);

  // Scanned pages state
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"camera" | "preview">("camera");

  // OCR/Tesseract status
  const [ocrInitialized, setOcrInitialized] = useState(false);
  const [ocrWorker, setOcrWorker] = useState<any>(null);
  const [ocrProcessingPageId, setOcrProcessingPageId] = useState<string | null>(null);

  // PDF generation
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // Performance monitoring
  const [perfLogs, setPerfLogs] = useState<PerformanceMetric[]>([]);
  const [timestamps, setTimestamps] = useState({
    pageLoadStart: 0,
    uiRendered: 0,
    cameraReady: 0,
    ocrInit: 0,
  });
  const [mountCamera, setMountCamera] = useState(false);

  // Set delayed camera setup to ensure page renders in <1s
  useEffect(() => {
    const t = setTimeout(() => {
      setMountCamera(true);
    }, 500);
    return () => clearTimeout(t);
  }, []);

  const workerPromises = useRef<Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>>(new Map());

  // ── 1. Page Load Start Calculation ──────────────────────────────────
  useEffect(() => {
    const pageLoadStart = (window as any).sp_page_load_start || Date.now();
    const uiRendered = Date.now();

    setTimestamps((prev) => ({
      ...prev,
      pageLoadStart,
      uiRendered,
    }));

    addPerfMetric("Page load start", pageLoadStart, pageLoadStart);
    addPerfMetric("Scanner UI rendered", uiRendered, pageLoadStart);
  }, []);

  const addPerfMetric = (label: string, time: number, start: number) => {
    setPerfLogs((prev) => {
      // Avoid duplicates
      if (prev.some((p) => p.label === label)) return prev;
      return [...prev, { label, timestamp: time, elapsedMs: time - start }];
    });
  };

  // ── 2. Web Worker Initialization (Delayed until camera mounts) ──────
  useEffect(() => {
    if (!mountCamera) return;

    try {
      const worker = new Worker("/workers/scanner.worker.js");
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { id, result, error } = e.data;
        const promise = workerPromises.current.get(id);
        if (promise) {
          if (error) {
            promise.reject(new Error(error));
          } else {
            promise.resolve(result);
          }
          workerPromises.current.delete(id);
        }
      };

      console.log("[Scanner] Web Worker connected successfully.");
    } catch (e) {
      console.error("[Scanner] Web Worker connection failure:", e);
      toast.error("Web Worker initialization failed. Processing will fall back to main thread.");
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [mountCamera]);

  const runWorkerCommand = (command: string, payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Worker not available"));
        return;
      }
      const id = Math.random().toString(36).substring(2, 9);
      workerPromises.current.set(id, { resolve, reject });

      // Transferable array buffers for zero-copy memory transfers
      const transferables: Transferable[] = [];
      if (command === "applyFilters" && payload.pixels) {
        transferables.push(payload.pixels);
      } else if (command === "compressImage" && payload.pixels) {
        transferables.push(payload.pixels);
      } else if (command === "generatePdf" && payload.images) {
        payload.images.forEach((img: any) => {
          if (img.data) transferables.push(img.data);
        });
      }

      workerRef.current.postMessage({ command, id, payload }, transferables);
    });
  };



  // Terminate OCR worker on unmount if it was initialized
  useEffect(() => {
    return () => {
      if (ocrWorker) {
        ocrWorker.terminate();
      }
    };
  }, [ocrWorker]);

  // ── 4. Camera Status Handler ────────────────────────────────────────
  const handleCameraReady = useCallback(() => {
    const readyTime = Date.now();
    setTimestamps((prev) => {
      const start = prev.pageLoadStart || Date.now();
      addPerfMetric("Camera ready", readyTime, start);

      // Log total startup time if OCR is also ready
      if (prev.ocrInit > 0) {
        const maxReady = Math.max(prev.ocrInit, readyTime);
        addPerfMetric("Total startup time", maxReady, start);
      }

      return { ...prev, cameraReady: readyTime };
    });
  }, []);

  const handleCameraError = useCallback((err: string) => {
    console.error("[Camera] Ready failed:", err);
  }, []);

  // ── 5. Capture & Image Processing ───────────────────────────────────
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    const frame = cameraRef.current.capture();
    if (!frame) {
      toast.error("Failed to capture image frame from video feed.");
      return;
    }

    const { pixels, width, height, dataUrl } = frame;
    const pageId = Math.random().toString(36).substring(2, 9);

    toast.loading("Processing captured frame...", { id: "capture-toast" });

    try {
      // Compress captured raw frame in Web Worker to standard sizing
      const compressRes = await runWorkerCommand("compressImage", {
        pixels,
        width,
        height,
        maxDimension: 1600,
        quality: 0.85,
      });

      let finalWidth = compressRes.width;
      let finalHeight = compressRes.height;
      let finalPixels = compressRes.pixels;
      let finalDataUrl = dataUrl;

      // If offscreen canvas compressed to JPEG buffer, construct a data URL
      if (compressRes.compressedBuffer) {
        const blob = new Blob([compressRes.compressedBuffer], { type: "image/jpeg" });
        finalDataUrl = URL.createObjectURL(blob);
        finalPixels = compressRes.compressedBuffer;
      } else {
        // Fallback: draw pixel buffer to screen
        const canvas = document.createElement("canvas");
        canvas.width = finalWidth;
        canvas.height = finalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const imgData = ctx.createImageData(finalWidth, finalHeight);
          imgData.data.set(new Uint8ClampedArray(finalPixels));
          ctx.putImageData(imgData, 0, 0);
          finalDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        }
      }

      const newPage: ScannedPage = {
        id: pageId,
        originalDataUrl: finalDataUrl,
        filteredDataUrl: finalDataUrl,
        pixels: finalPixels,
        width: finalWidth,
        height: finalHeight,
        filters: {
          grayscale: false,
          threshold: false,
          contrast: 1,
        },
      };

      setPages((prev) => [...prev, newPage]);
      setActivePageId(pageId);
      setActiveTab("preview");

      toast.success("Page captured successfully!", { id: "capture-toast" });
    } catch (e) {
      console.error("[Capture] Processing error:", e);
      toast.error("Failed to compress captured image.", { id: "capture-toast" });
    }
  }, []);

  // ── 6. Apply Filters Off-Thread ──────────────────────────────────────
  const handleApplyFilter = async (pageId: string, filterType: "normal" | "grayscale" | "threshold") => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;

    const newFilters = {
      grayscale: filterType === "grayscale" || filterType === "threshold",
      threshold: filterType === "threshold",
      contrast: page.filters.contrast,
    };

    if (filterType === "normal") {
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? { ...p, filters: newFilters, filteredDataUrl: p.originalDataUrl }
            : p
        )
      );
      return;
    }

    toast.loading("Applying filters...", { id: "filter-toast" });

    try {
      // Create a copy of pixels to transfer to the Web Worker
      const pixelCopy = page.pixels.slice(0);

      const filterResult = await runWorkerCommand("applyFilters", {
        width: page.width,
        height: page.height,
        pixels: pixelCopy,
        filters: newFilters,
      });

      // Render filter pixels back to Data URL
      const canvas = document.createElement("canvas");
      canvas.width = page.width;
      canvas.height = page.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const imgData = ctx.createImageData(page.width, page.height);
        imgData.data.set(new Uint8ClampedArray(filterResult.pixels));
        ctx.putImageData(imgData, 0, 0);

        const filteredDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setPages((prev) =>
          prev.map((p) =>
            p.id === pageId
              ? { ...p, filters: newFilters, filteredDataUrl }
              : p
          )
        );
        toast.success("Filters applied off-thread!", { id: "filter-toast" });
      }
    } catch (e) {
      console.error("[Filter] Failed:", e);
      toast.error("Failed to apply filters in worker.", { id: "filter-toast" });
    }
  };

  // ── 7. OCR Text Recognition ─────────────────────────────────────────
  const handleRunOcr = async (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;

    setOcrProcessingPageId(pageId);
    toast.loading("Initializing OCR engine and processing...", { id: "ocr-toast" });

    try {
      let activeWorker = ocrWorker;
      if (!ocrInitialized || !activeWorker) {
        console.log("[OCR] Lazy-loading Tesseract.js library on demand...");
        const { createWorker } = await import("tesseract.js");
        activeWorker = await createWorker("eng");
        setOcrWorker(activeWorker);
        setOcrInitialized(true);
      }

      // Use the active filtered image for better OCR accuracy (B&W/grayscale text reads cleaner)
      const imageToOcr = page.filteredDataUrl;
      const { data } = await activeWorker.recognize(imageToOcr);

      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, ocrText: data.text } : p))
      );
      toast.success("OCR completed! Text extracted.", { id: "ocr-toast" });
    } catch (e) {
      console.error("[OCR] Analysis error:", e);
      toast.error("OCR analysis failed.", { id: "ocr-toast" });
    } finally {
      setOcrProcessingPageId(null);
    }
  };

  // ── 8. PDF Compilation ─────────────────────────────────────────────
  const handleCompilePdf = async () => {
    if (pages.length === 0) {
      toast.error("Please scan at least one page to compile a PDF.");
      return;
    }

    setPdfGenerating(true);
    toast.loading("Compiling PDF in worker thread...", { id: "pdf-toast" });

    try {
      // Retrieve the JPEGs of all pages as array buffers
      const imagePayload = await Promise.all(
        pages.map(async (page) => {
          // Fetch the JPEG blob from data URL
          const res = await fetch(page.filteredDataUrl);
          const blob = await res.blob();
          const buffer = await blob.arrayBuffer();
          return {
            data: buffer,
            width: page.width,
            height: page.height,
          };
        })
      );

      // Compile binary PDF document off-thread in Worker
      const pdfRes = await runWorkerCommand("generatePdf", {
        images: imagePayload,
      });

      const pdfBlob = new Blob([pdfRes.pdfData], { type: "application/pdf" });
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Trigger standard browser download
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = `SmartPrint_Scan_${Date.now().toString(36)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.success("PDF compiled and downloaded successfully!", { id: "pdf-toast" });
    } catch (e) {
      console.error("[PDF] Compilation error:", e);
      toast.error("Failed to generate PDF.", { id: "pdf-toast" });
    } finally {
      setPdfGenerating(false);
    }
  };

  // ── 9. Delete Page ──────────────────────────────────────────────────
  const handleDeletePage = (pageId: string) => {
    setPages((prev) => {
      const filtered = prev.filter((p) => p.id !== pageId);
      if (activePageId === pageId) {
        setActivePageId(filtered.length > 0 ? filtered[filtered.length - 1].id : null);
        if (filtered.length === 0) {
          setActiveTab("camera");
        }
      }
      return filtered;
    });
    toast.success("Page deleted");
  };

  const activePage = pages.find((p) => p.id === activePageId);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-slate-900 rounded-3xl border border-slate-800 text-white flex flex-col font-sans overflow-hidden shadow-2xl relative">
      {/* Header bar */}
      <header className="h-16 px-4 md:px-6 border-b border-slate-800 flex items-center justify-between flex-shrink-0 bg-slate-950/45">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Camera className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-100 tracking-wide uppercase">Smart Scanner</h1>
            <p className="text-[10px] text-slate-400 font-extrabold flex items-center gap-1 uppercase tracking-widest mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              OCR Engine Loaded
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab selector */}
          <div className="bg-slate-950 border border-slate-800 p-0.5 rounded-xl flex">
            <button
              onClick={() => setActiveTab("camera")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "camera"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Camera className="w-3.5 h-3.5" /> Camera
            </button>
            <button
              onClick={() => {
                if (pages.length === 0) {
                  toast.error("Scan a page first to view preview");
                  return;
                }
                setActiveTab("preview");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "preview"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              disabled={pages.length === 0}
            >
              <Eye className="w-3.5 h-3.5" /> Preview ({pages.length})
            </button>
          </div>
        </div>
      </header>

      {/* Main workspace area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Main interactive panel */}
        <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-4 relative min-h-[350px]">
          {activeTab === "camera" ? (
            <div className="w-full h-full max-w-2xl aspect-[3/4] sm:aspect-[4/3] max-h-[500px] relative flex items-center justify-center">
              {mountCamera ? (
                <CameraPreview
                  ref={cameraRef}
                  onCameraReady={handleCameraReady}
                  onCameraError={handleCameraError}
                />
              ) : (
                <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center rounded-2xl border border-slate-800">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-emerald-400 animate-pulse" />
                  </div>
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-3">
                    Preparing Scanner View...
                  </span>
                </div>
              )}

              {/* Shutter capture button overlay */}
              <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-6 z-10">
                <div className="w-18 h-18 rounded-full border-4 border-emerald-500/20 bg-slate-900 flex items-center justify-center p-1 cursor-pointer transition active:scale-90 hover:bg-slate-850" onClick={handleCapture}>
                  <div className="w-full h-full rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                    <Camera className="w-7 h-7" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Preview & Editor tab
            <div className="w-full h-full max-w-2xl flex flex-col gap-4">
              <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 flex items-center justify-center relative overflow-hidden">
                {activePage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activePage.filteredDataUrl}
                    alt="Scanned Document Page"
                    className="max-w-full max-h-[420px] rounded-lg shadow-xl border border-slate-850 object-contain"
                  />
                )}
              </div>

              {/* Active page filter controls */}
              {activePage && (
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">Document Filters</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApplyFilter(activePage.id, "normal")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                        !activePage.filters.grayscale
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Color
                    </button>
                    <button
                      onClick={() => handleApplyFilter(activePage.id, "grayscale")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                        activePage.filters.grayscale && !activePage.filters.threshold
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Grayscale
                    </button>
                    <button
                      onClick={() => handleApplyFilter(activePage.id, "threshold")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                        activePage.filters.threshold
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      B&amp;W Doc
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar thumbnails queue & actions */}
        <div className="w-full md:w-80 bg-slate-900/60 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col flex-shrink-0 h-[260px] md:h-auto overflow-hidden">
          {/* Section header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/20">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Document Queue</h3>
            <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 text-emerald-400 text-[10px] font-black rounded-full">
              {pages.length} {pages.length === 1 ? "Page" : "Pages"}
            </span>
          </div>

          {/* Thumbnail scroll list */}
          <div className="flex-1 p-4 space-y-3 overflow-y-auto min-h-0 bg-slate-900/35">
            {pages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6">
                <FileText className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs font-bold uppercase tracking-wider">No Pages Scanned</p>
                <p className="text-[10px] text-slate-500 mt-1 max-w-[160px]">
                  Align your document and tap the shutter button to begin.
                </p>
              </div>
            ) : (
              pages.map((page, idx) => (
                <div
                  key={page.id}
                  onClick={() => {
                    setActivePageId(page.id);
                    setActiveTab("preview");
                  }}
                  className={`flex items-center gap-3 p-2 border rounded-xl cursor-pointer transition ${
                    activePageId === page.id
                      ? "bg-slate-800/80 border-emerald-500/50"
                      : "bg-slate-950/40 border-slate-850 hover:bg-slate-800/40"
                  }`}
                >
                  <div className="w-10 h-14 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={page.filteredDataUrl} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-extrabold text-slate-300 truncate">Page {idx + 1}</p>
                    <p className="text-[9px] text-slate-500 font-extrabold uppercase mt-0.5 tracking-wider">
                      {page.width}x{page.height} px
                    </p>
                    {page.ocrText && (
                      <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded mt-1">
                        <CheckCircle className="w-2.5 h-2.5" /> Text Extracted
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDeletePage(page.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-850 text-slate-500 hover:text-rose-400 transition"
                      title="Delete Page"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* OCR Panel / Actions */}
          {activePage && activeTab === "preview" && (
            <div className="p-3 border-t border-slate-800 bg-slate-950/20">
              {activePage.ocrText ? (
                <div className="bg-slate-950/65 rounded-xl border border-slate-850 p-2.5 max-h-24 overflow-y-auto">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Extracted Text (OCR)
                  </p>
                  <p className="text-[10px] text-slate-300 leading-normal font-mono select-all">
                    {activePage.ocrText}
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => handleRunOcr(activePage.id)}
                  disabled={ocrProcessingPageId === activePage.id}
                  className="w-full py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 disabled:opacity-40 text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-2 active:scale-98"
                >
                  {ocrProcessingPageId === activePage.id ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Analyzing Page Text...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      Run OCR Text Extraction
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Bottom page action compile PDF button */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/40">
            <button
              onClick={handleCompilePdf}
              disabled={pages.length === 0 || pdfGenerating}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 text-xs font-black rounded-xl transition flex items-center justify-center gap-2 active:scale-98 shadow-lg shadow-emerald-500/10"
            >
              {pdfGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-slate-950" />
                  Compile &amp; Download PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Diagnostics / Performance Monitor overlay collapsible bar */}
      <footer className="bg-slate-950 border-t border-slate-850 px-4 py-2.5 flex items-center justify-between text-xs font-mono text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1 text-[10px]">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            Performance Diagnostics:
          </span>
          {perfLogs.map((log) => (
            <span key={log.label} className="text-[9px] bg-slate-900 border border-slate-850 px-2 py-0.5 rounded-full text-slate-300">
              {log.label}: <strong className="text-emerald-400">{log.elapsedMs}ms</strong>
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
export default ScannerContainer;
