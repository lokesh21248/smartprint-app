// Edge runtime Sentry configuration.
// Runs for middleware, edge routes, and edge API handlers.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://9f2ddc0b8fa48768054c21450b52ee90@o4511199536021504.ingest.de.sentry.io/4511199543820368",

  // ── Sampling ──────────────────────────────────────────────────────────────
  // Edge functions are lightweight — keep trace rate low to avoid quota burn.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // ── Logs ──────────────────────────────────────────────────────────────────
  enableLogs: true,

  // ── PII ───────────────────────────────────────────────────────────────────
  sendDefaultPii: true,

  // ── Environment ───────────────────────────────────────────────────────────
  environment: process.env.NODE_ENV || "development",

  // ── Release tracking ──────────────────────────────────────────────────────
  release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,

  // ── Filtering ─────────────────────────────────────────────────────────────
  ignoreErrors: [
    "TypeError: Failed to fetch",
    "TypeError: NetworkError",
    "ClerkRuntimeError",
  ],
});
