// Server-side Sentry configuration.
// Runs whenever the server handles a request (Node.js runtime).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://9f2ddc0b8fa48768054c21450b52ee90@o4511199536021504.ingest.de.sentry.io/4511199543820368",

  // ── Sampling ──────────────────────────────────────────────────────────────
  // 100% traces in dev/staging, 20% in production to control costs.
  // Errors are ALWAYS captured at 100% regardless of trace sampling.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // ── Logs ──────────────────────────────────────────────────────────────────
  enableLogs: true,

  // ── PII ───────────────────────────────────────────────────────────────────
  sendDefaultPii: true,

  // ── Environment ───────────────────────────────────────────────────────────
  environment: process.env.NODE_ENV || "development",

  // ── Release tracking ──────────────────────────────────────────────────────
  // Vercel sets VERCEL_GIT_COMMIT_SHA automatically
  release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,

  // ── Filtering ─────────────────────────────────────────────────────────────
  // Ignore noisy errors that aren't actionable
  ignoreErrors: [
    // Network errors from flaky mobile connections
    "TypeError: Failed to fetch",
    "TypeError: NetworkError",
    "TypeError: Load failed",
    // Clerk auth errors (user closed popup, etc.)
    "ClerkRuntimeError",
    // Supabase realtime reconnects (handled gracefully in-app)
    "WebSocket connection failed",
  ],

  // ── Before send hook ──────────────────────────────────────────────────────
  // Add custom context to every error event
  beforeSend(event) {
    // Tag rate-limited responses for alerting
    if (event.tags?.["http.status_code"] === "429") {
      event.tags["alert.category"] = "rate_limit";
    }
    return event;
  },
});
