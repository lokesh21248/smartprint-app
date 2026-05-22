/**
 * errorClassifier.ts
 *
 * Classifies raw upload errors into user-friendly, actionable messages.
 *
 * Any layer of the upload pipeline (TUS, fetch, presign) can throw a raw error.
 * This module normalises all of them into a structured result with:
 *  - `code`        — machine-readable category (for logging / analytics)
 *  - `userMessage` — plain English shown in the UI
 *  - `retryable`   — whether the user should be offered a retry button
 *
 * Usage:
 *   const result = classifyUploadError(err);
 *   updateState("failed", 0, { error: result.userMessage });
 */

export type UploadErrorCode =
  | "OFFLINE"
  | "TIMEOUT"
  | "FILE_TOO_LARGE"
  | "MIME_TYPE_REJECTED"
  | "RATE_LIMITED"
  | "SHOP_INACTIVE"
  | "AUTH_FAILED"
  | "BUCKET_NOT_FOUND"
  | "STORAGE_QUOTA"
  | "SERVER_ERROR"
  | "SERVER_UNAVAILABLE"
  | "PRESIGN_FAILED"
  | "SUPABASE_ERROR"
  | "CANCELLED"
  | "UNKNOWN";

export interface ClassifiedError {
  code: UploadErrorCode;
  userMessage: string;
  retryable: boolean;
}

// ─── Pattern Matchers ─────────────────────────────────────────────────────────

const NETWORK_PATTERNS = [
  "failed to fetch",
  "network request failed",
  "networkerror",
  "err_network",
  "err_internet_disconnected",
  "load failed",
  "the internet connection appears to be offline",
];

const TIMEOUT_PATTERNS = [
  "timeout",
  "timed out",
  "signal is aborted",
  "aborted",
  "request timeout",
];

const SIZE_PATTERNS = [
  "exceeded the maximum allowed size",
  "file too large",
  "payload too large",
  "request entity too large",
  "413",
];

const MIME_PATTERNS = [
  "mime type",
  "content-type",
  "not allowed",
  "invalid type",
  "unsupported media type",
  "415",
];

const RATE_LIMIT_PATTERNS = ["too many requests", "rate limit", "429", "slow down"];

const AUTH_PATTERNS = ["unauthorized", "401", "forbidden", "403", "permission denied", "access denied"];

const STORAGE_PATTERNS = [
  "bucket not found",
  "object not found",
  "storage quota",
  "supabase",
  "storage error",
];

function matchesAny(msg: string, patterns: string[]): boolean {
  const lower = msg.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

// ─── HTTP Status → Error Code Mapping ────────────────────────────────────────

function fromHttpStatus(status: number): ClassifiedError | null {
  switch (true) {
    case status === 401 || status === 403:
      return {
        code: "AUTH_FAILED",
        userMessage: "Permission denied. The upload link may have expired — please try again.",
        retryable: true,
      };
    case status === 413:
      return {
        code: "FILE_TOO_LARGE",
        userMessage: "File exceeds the 25 MB size limit. Please reduce file size and try again.",
        retryable: false,
      };
    case status === 415:
      return {
        code: "MIME_TYPE_REJECTED",
        userMessage: "Unsupported file type. Only PDF, PNG, and JPG files are accepted.",
        retryable: false,
      };
    case status === 429:
      return {
        code: "RATE_LIMITED",
        userMessage: "Too many uploads. Please wait a moment and try again.",
        retryable: true,
      };
    case status === 500 || status === 502 || status === 503 || status === 504:
      return {
        code: "SERVER_UNAVAILABLE",
        userMessage: "The server is temporarily unavailable. Please retry in a few seconds.",
        retryable: true,
      };
    default:
      return null;
  }
}

// ─── Main Classifier ──────────────────────────────────────────────────────────

/**
 * Classify any thrown error from the upload pipeline into a user-friendly result.
 *
 * @param error  - The raw error (Error, string, TUS error object, or unknown)
 * @param context - Optional: 'presign' | 'tus' | 'compress' for extra context
 */
export function classifyUploadError(
  error: unknown,
  context: "presign" | "tus" | "compress" | "general" = "general"
): ClassifiedError {
  // ── Cancelled (AbortError) ────────────────────────────────────────────────
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      code: "CANCELLED",
      userMessage: "Upload was cancelled.",
      retryable: true,
    };
  }

  // ── Offline check (at the moment of classification) ───────────────────────
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      code: "OFFLINE",
      userMessage: "No internet connection. Your upload will resume when you're back online.",
      retryable: true,
    };
  }

  // ── Try to extract HTTP status from TUS error (tus-js-client attaches it) ─
  const tusError = error as {
    originalResponse?: { getStatus?: () => number; getBody?: () => string };
    message?: string;
  };

  if (tusError?.originalResponse?.getStatus) {
    const status = tusError.originalResponse.getStatus();
    const fromStatus = fromHttpStatus(status);
    if (fromStatus) return fromStatus;

    // Try to get body for more detail
    const body = tusError.originalResponse.getBody?.() ?? "";
    if (body.toLowerCase().includes("bucket not found")) {
      return {
        code: "BUCKET_NOT_FOUND",
        userMessage: "Storage configuration error. Please contact support.",
        retryable: false,
      };
    }
    if (body.toLowerCase().includes("quota")) {
      return {
        code: "STORAGE_QUOTA",
        userMessage: "Storage limit reached. Please contact support.",
        retryable: false,
      };
    }
  }

  // ── String / Error message matching ──────────────────────────────────────
  const rawMessage = error instanceof Error ? error.message : String(error ?? "Unknown error");

  if (matchesAny(rawMessage, TIMEOUT_PATTERNS)) {
    return {
      code: "TIMEOUT",
      userMessage: "Upload timed out. Check your connection speed and tap Retry.",
      retryable: true,
    };
  }

  if (matchesAny(rawMessage, NETWORK_PATTERNS)) {
    return {
      code: "OFFLINE",
      userMessage: "Network error. Check your internet connection and tap Retry.",
      retryable: true,
    };
  }

  if (matchesAny(rawMessage, SIZE_PATTERNS)) {
    return {
      code: "FILE_TOO_LARGE",
      userMessage: "File exceeds the 25 MB size limit.",
      retryable: false,
    };
  }

  if (matchesAny(rawMessage, MIME_PATTERNS)) {
    return {
      code: "MIME_TYPE_REJECTED",
      userMessage: "Unsupported file type. Only PDF, PNG, and JPG files are accepted.",
      retryable: false,
    };
  }

  if (matchesAny(rawMessage, RATE_LIMIT_PATTERNS)) {
    return {
      code: "RATE_LIMITED",
      userMessage: "Upload limit reached. Please wait a moment and try again.",
      retryable: true,
    };
  }

  if (matchesAny(rawMessage, AUTH_PATTERNS)) {
    return {
      code: "AUTH_FAILED",
      userMessage: "Upload permission denied. Please refresh the page and try again.",
      retryable: true,
    };
  }

  if (matchesAny(rawMessage, STORAGE_PATTERNS)) {
    return {
      code: "SUPABASE_ERROR",
      userMessage: "Storage service error. Please tap Retry — this is usually temporary.",
      retryable: true,
    };
  }

  if (context === "presign") {
    return {
      code: "PRESIGN_FAILED",
      userMessage: "Failed to start upload. Please tap Retry.",
      retryable: true,
    };
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return {
    code: "UNKNOWN",
    userMessage: rawMessage.length > 0 && rawMessage.length < 200
      ? rawMessage
      : "Upload failed. Please tap Retry.",
    retryable: true,
  };
}

/** Returns a human-readable label for an error code (for analytics/logs). */
export function errorCodeLabel(code: UploadErrorCode): string {
  const labels: Record<UploadErrorCode, string> = {
    OFFLINE: "Offline",
    TIMEOUT: "Timeout",
    FILE_TOO_LARGE: "File Too Large",
    MIME_TYPE_REJECTED: "Invalid File Type",
    RATE_LIMITED: "Rate Limited",
    SHOP_INACTIVE: "Shop Inactive",
    AUTH_FAILED: "Permission Denied",
    BUCKET_NOT_FOUND: "Bucket Not Found",
    STORAGE_QUOTA: "Storage Quota",
    SERVER_ERROR: "Server Error",
    SERVER_UNAVAILABLE: "Server Unavailable",
    PRESIGN_FAILED: "Presign Failed",
    SUPABASE_ERROR: "Supabase Error",
    CANCELLED: "Cancelled",
    UNKNOWN: "Unknown",
  };
  return labels[code] ?? code;
}
