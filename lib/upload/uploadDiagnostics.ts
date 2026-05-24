/**
 * uploadDiagnostics.ts
 *
 * Enterprise-grade upload diagnostic utility for SmartPrint.
 * Captures browser, OS, memory usage, network connection types,
 * and staging/verification results to facilitate deep mobile debugging.
 */

export interface DiagnosticPayload {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  deviceType: string;
  browser: string;
  os: string;
  networkStatus: "online" | "offline";
  effectiveConnectionType?: string;
  memoryUsage?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
  durationMs?: number;
  retryCount: number;
  uploadSpeedBytesSec?: number;
  supabaseResponseStatus?: string;
  verificationResult?: "success" | "failed" | "not_verified";
  timestamp: number;
}

/** Captures a full high-fidelity snapshot of the current client environment and upload stats. */
export function getDiagnosticsSnapshot(params: {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  retryCount: number;
  durationMs?: number;
  uploadSpeedBytesSec?: number;
  supabaseResponseStatus?: string;
  verificationResult?: "success" | "failed" | "not_verified";
}): DiagnosticPayload {
  let deviceType = "desktop";
  let browser = "unknown";
  let os = "unknown";
  let effectiveConnectionType: string | undefined = undefined;
  let memoryUsage: DiagnosticPayload["memoryUsage"] = undefined;

  if (typeof window !== "undefined" && typeof navigator !== "undefined") {
    const ua = navigator.userAgent;

    // 1. Detect Device & OS
    if (/android/i.test(ua)) {
      deviceType = "mobile_android";
      os = "Android";
    } else if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) {
      deviceType = "mobile_ios";
      os = "iOS";
    } else if (/windows/i.test(ua)) {
      os = "Windows";
    } else if (/macintosh/i.test(ua)) {
      os = "MacOS";
    } else if (/linux/i.test(ua)) {
      os = "Linux";
    }

    // 2. Detect Browser
    if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua)) {
      browser = "Chrome";
    } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
      browser = "Safari";
    } else if (/firefox|fxios/i.test(ua)) {
      browser = "Firefox";
    } else if (/opr\//i.test(ua)) {
      browser = "Opera";
    } else if (/edg/i.test(ua)) {
      browser = "Edge";
    }

    // 3. Network Connection
    const conn =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;
    if (conn) {
      effectiveConnectionType = conn.effectiveType;
    }

    // 4. Memory Heap Usage
    const perf = window.performance as any;
    if (perf && perf.memory) {
      memoryUsage = {
        usedJSHeapSize: perf.memory.usedJSHeapSize,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
      };
    }
  }

  return {
    fileId: params.fileId,
    fileName: params.fileName,
    fileSize: params.fileSize,
    mimeType: params.mimeType,
    deviceType,
    browser,
    os,
    networkStatus: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
    effectiveConnectionType,
    memoryUsage,
    durationMs: params.durationMs,
    retryCount: params.retryCount,
    uploadSpeedBytesSec: params.uploadSpeedBytesSec,
    supabaseResponseStatus: params.supabaseResponseStatus,
    verificationResult: params.verificationResult ?? "not_verified",
    timestamp: Date.now(),
  };
}

/** Log diagnostics payload in a unified format to stdout/console. */
export function logUploadDiagnostics(payload: DiagnosticPayload, category: "SUCCESS" | "FAILURE" | "STAGE" = "STAGE"): void {
  const prefix = `[UPLOAD_DIAGNOSTICS:${category}]`;
  console.log(prefix, JSON.stringify(payload, null, 2));
}
