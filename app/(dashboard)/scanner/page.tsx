"use client";

import React from "react";
import dynamic from "next/dynamic";
import { ScannerSkeleton } from "@/components/scanner/ScannerSkeleton";

// Record page load start timestamp at earliest script evaluation
if (typeof window !== "undefined" && !(window as any).sp_page_load_start) {
  // Capture high-precision browser start time
  (window as any).sp_page_load_start = Date.now();
}

const ScannerContainer = dynamic(
  () => import("@/components/scanner/ScannerContainer"),
  {
    ssr: false,
    loading: () => <ScannerSkeleton />,
  }
);

export default function ScannerPage() {
  return <ScannerContainer />;
}
