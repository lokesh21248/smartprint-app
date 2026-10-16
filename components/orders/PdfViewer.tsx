"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Download,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfViewerProps {
  url: string;
  fileName?: string;
  onRetry?: () => void;
  onDownload?: () => void;
  onOpenNewTab?: () => void;
}

export function PdfViewer({
  url,
  fileName = "Document.pdf",
  onRetry,
  onDownload,
  onOpenNewTab,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);

  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // ── 1. Load PDF Document ──────────────────────────────────────────────────
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      if (!url) {
        setError("Missing PDF document URL");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setCurrentPage(1);

      try {
        const pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.js");
        const pdfjs = (pdfjsModule as any).default || pdfjsModule;

        if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
        }

        const loadingTask = pdfjs.getDocument({
          url,
          withCredentials: false,
          cMapUrl: "https://unpkg.com/pdfjs-dist@3.11.174/cmaps/",
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;

        if (isCancelled) return;

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err: any) {
        if (isCancelled) return;
        console.error("[PdfViewer] Error loading PDF:", err);
        const message = err?.message || "Failed to load PDF document";
        setError(message.includes("403") || message.includes("expired")
          ? "Access link has expired. Please click Retry to generate a new link."
          : message);
        setLoading(false);
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore cancellation
        }
      }
    };
  }, [url]);

  // ── 2. Render Current Page ────────────────────────────────────────────────
  const renderPage = useCallback(
    async (pageNum: number) => {
      const doc = pdfDocRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;

      if (!doc || !canvas || !container) return;

      // Cancel previous render if active
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore
        }
        renderTaskRef.current = null;
      }

      setRendering(true);

      try {
        const page = await doc.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1, rotation });

        // Calculate responsive scale to fit container width
        const availableWidth = Math.max(container.clientWidth - 32, 280);
        const baseFitScale = availableWidth / unscaledViewport.width;
        // Clamp scale so it doesn't get ridiculously small or large
        const effectiveScale = Math.min(Math.max(baseFitScale * zoomLevel, 0.4), 3.0);

        const viewport = page.getViewport({ scale: effectiveScale, rotation });

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        // Support Retina / Hi-DPI screens
        const pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null;

        const renderContext = {
          canvasContext: ctx,
          transform,
          viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;

        await task.promise;
        renderTaskRef.current = null;
        setRendering(false);
      } catch (err: any) {
        if (err?.name === "RenderingCancelledException") {
          // Expected when rapidly switching pages/zoom
          return;
        }
        console.error("[PdfViewer] Render page error:", err);
        setRendering(false);
      }
    },
    [zoomLevel, rotation]
  );

  useEffect(() => {
    if (!loading && !error && numPages > 0) {
      renderPage(currentPage);
    }
  }, [loading, error, numPages, currentPage, renderPage]);

  // Window resize re-render debounced
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!loading && !error && numPages > 0) {
          renderPage(currentPage);
        }
      }, 150);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, [loading, error, numPages, currentPage, renderPage]);

  // ── 3. Controls Handlers ──────────────────────────────────────────────────
  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((p) => p - 1);
  };

  const handleNextPage = () => {
    if (currentPage < numPages) setCurrentPage((p) => p + 1);
  };

  const handleZoomIn = () => {
    setZoomLevel((z) => Math.min(z + 0.25, 2.5));
  };

  const handleZoomOut = () => {
    setZoomLevel((z) => Math.max(z - 0.25, 0.5));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-xl overflow-hidden">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-700 select-none">
        {/* Pagination */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || loading || !!error}
            aria-label="Previous Page"
            className="h-7 w-7 rounded-md hover:bg-slate-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="font-medium text-slate-600 px-1 whitespace-nowrap">
            {numPages > 0 ? (
              <>
                Page <span className="font-semibold text-slate-900">{currentPage}</span> of{" "}
                <span className="font-semibold text-slate-900">{numPages}</span>
              </>
            ) : (
              "Page 1"
            )}
          </span>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleNextPage}
            disabled={currentPage >= numPages || loading || !!error}
            aria-label="Next Page"
            className="h-7 w-7 rounded-md hover:bg-slate-200"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.5 || loading || !!error}
            aria-label="Zoom Out"
            className="h-7 w-7 rounded-md hover:bg-slate-200"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>

          <span className="text-[11px] font-medium text-slate-600 w-10 text-center">
            {Math.round(zoomLevel * 100)}%
          </span>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 2.5 || loading || !!error}
            aria-label="Zoom In"
            className="h-7 w-7 rounded-md hover:bg-slate-200"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleResetZoom}
            disabled={loading || !!error}
            title="Fit to Width"
            className="h-7 w-7 rounded-md hover:bg-slate-200"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRotate}
            disabled={loading || !!error}
            title="Rotate Clockwise"
            className="h-7 w-7 rounded-md hover:bg-slate-200"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>

          {onOpenNewTab && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onOpenNewTab}
              title="Open in new window"
              className="h-7 w-7 rounded-md hover:bg-slate-200"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Document View Area ────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-[#525659]/10 p-3 sm:p-5 flex items-center justify-center min-h-[380px] max-h-[580px]"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="w-9 h-9 animate-spin text-[#2E8B57] mb-3" />
            <p className="text-sm font-semibold text-slate-700">Loading document preview...</p>
            <p className="text-xs text-slate-500 mt-0.5">Fetching and rendering PDF pages</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-3 shadow-inner">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Preview Unavailable</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">{error}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onRetry && (
                <Button size="sm" onClick={onRetry} className="gap-1.5 bg-[#2E8B57] hover:bg-[#1F6B42] text-xs h-8">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry Preview
                </Button>
              )}
              {onDownload && (
                <Button size="sm" variant="outline" onClick={onDownload} className="gap-1.5 text-xs h-8">
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="relative shadow-md rounded-md overflow-hidden bg-white mx-auto transition-transform duration-150">
            {rendering && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 transition-opacity">
                <Loader2 className="w-6 h-6 animate-spin text-[#2E8B57]" />
              </div>
            )}
            <canvas ref={canvasRef} className="block max-w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
