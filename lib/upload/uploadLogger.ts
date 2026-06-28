/**
 * uploadLogger.ts
 *
 * Centralized, structured logger for the SmartPrint upload pipeline.
 * All upload events — start, progress, success, failure, retry — are routed
 * through here so production issues can be diagnosed by reading console output
 * in a single, consistent format.
 *
 * Zero external dependencies. Outputs to console only.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface UploadLogPayload {
  event: string;
  fileName?: string;
  fileSizeBytes?: number;
  attempt?: number;
  progress?: number;
  storagePath?: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  extra?: Record<string, unknown>;
}

const LOG_PREFIX = "[SmartPrint:Upload]";
const IS_DEV = process.env.NODE_ENV !== "production";

function emit(level: LogLevel, payload: UploadLogPayload): void {
  // In production: only emit errors and warnings — all info/debug telemetry is silent.
  // This eliminates 30+ console.log calls per file upload without losing actionable errors.
  if (!IS_DEV && (level === "info" || level === "debug")) return;

  const ts = new Date().toISOString();
  const msg = `${LOG_PREFIX} [${ts}] ${payload.event}${payload.fileName ? ` — ${payload.fileName}` : ""}`;

  // In dev, pretty-print; in production keep it as a single serializable line
  if (IS_DEV) {
    const logFn =
      level === "error"
        ? console.error
        : level === "warn"
        ? console.warn
        : level === "debug"
        ? console.debug
        : console.log;
    logFn(msg, payload);
  } else {
    // Production: single JSON line — easy to grep / forward to Sentry / Datadog
    // Only error/warn reach this point (info/debug are filtered above)
    const line = JSON.stringify({ level, ...payload, ts });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────


/** Called when a file enters the upload pipeline. */
export function logUploadStart(fileName: string, fileSizeBytes: number, attempt = 1): void {
  emit("info", { event: "upload:start", fileName, fileSizeBytes, attempt });
}

/** Called on each TUS chunk progress update. */
export function logUploadChunk(
  fileName: string,
  progress: number,
  bytesSent: number,
  bytesTotal: number
): void {
  emit("debug", {
    event: "upload:chunk",
    fileName,
    progress,
    extra: { bytesSent, bytesTotal },
  });
}

/** Called when a file uploads successfully. */
export function logUploadSuccess(
  fileName: string,
  fileSizeBytes: number,
  storagePath: string,
  durationMs: number
): void {
  emit("info", { event: "upload:success", fileName, fileSizeBytes, storagePath, durationMs });
}

/** Called when a file upload fails. */
export function logUploadFailure(
  fileName: string,
  errorCode: string,
  errorMessage: string,
  attempt: number
): void {
  emit("error", { event: "upload:failure", fileName, errorCode, errorMessage, attempt });
}

/** Called when an upload retry is initiated. */
export function logRetryAttempt(fileName: string, attempt: number, delayMs: number): void {
  emit("warn", { event: "upload:retry", fileName, attempt, extra: { delayMs } });
}

/** Called when requesting a presign token from the server. */
export function logPresignRequest(fileName: string, fileSizeBytes: number): void {
  emit("info", { event: "presign:request", fileName, fileSizeBytes });
}

/** Called after presign token is received (or fails). */
export function logPresignResult(
  fileName: string,
  success: boolean,
  errorMessage?: string
): void {
  if (success) {
    emit("info", { event: "presign:success", fileName });
  } else {
    emit("error", { event: "presign:failure", fileName, errorMessage });
  }
}

/** Called after image compression completes. */
export function logCompressionResult(
  fileName: string,
  originalBytes: number,
  finalBytes: number,
  compressed: boolean
): void {
  const savings = compressed
    ? `${Math.round((1 - finalBytes / originalBytes) * 100)}% smaller`
    : "skipped";
  emit("info", {
    event: "compression:done",
    fileName,
    fileSizeBytes: finalBytes,
    extra: { originalBytes, savings, compressed },
  });
}

/** Called when an upload is cancelled by the user. */
export function logUploadCancelled(fileName: string): void {
  emit("warn", { event: "upload:cancelled", fileName });
}

/** Called when offline detection pauses an upload. */
export function logNetworkPause(fileName: string): void {
  emit("warn", { event: "upload:network_pause", fileName });
}

/** Called when network resumes and an upload auto-restarts. */
export function logNetworkResume(fileName: string): void {
  emit("info", { event: "upload:network_resume", fileName });
}
