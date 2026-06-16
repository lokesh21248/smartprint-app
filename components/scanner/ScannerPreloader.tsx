"use client";

import React, { useEffect } from "react";

export function ScannerPreloader() {
  useEffect(() => {
    const preloadAssets = async () => {
      try {
        console.log("[Preloader] Idle callback triggered. Pre-warming scanner worker & libraries...");
        
        // 1. Instantiating the Web Worker caches the script in the browser cache
        const worker = new Worker("/workers/scanner.worker.js");
        worker.terminate();

        // 2. Dynamically importing Tesseract pulls the heavy JS chunks into cache
        await import("tesseract.js");
        
        console.log("[Preloader] Scanner assets and Web Worker cache pre-warmed.");
      } catch (e) {
        console.warn("[Preloader] Background asset preloading failed:", e);
      }
    };

    // Use requestIdleCallback if supported to ensure no competition with main thread layout/paint
    if (typeof window !== "undefined") {
      if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback(preloadAssets);
      } else {
        setTimeout(preloadAssets, 2000); // Fallback timeout of 2 seconds
      }
    }
  }, []);

  return null;
}
export default ScannerPreloader;
