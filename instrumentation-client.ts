// Client-side Sentry configuration.
// Runs in the browser whenever a user loads a page.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// Only load Sentry Replay on authenticated/dashboard pages.
// The Replay integration adds ~60 KB (gzip) to the client bundle and starts
// observing the DOM immediately — unnecessary on the public marketing pages
// where there is no user session to replay anyway.
const isAuthenticatedRoute =
  typeof window !== "undefined" &&
  /^\/(dashboard|admin|analytics|settings|profile|staff|shop-profile|my-shop|create-shop)/.test(
    window.location.pathname
  );

Sentry.init({
  dsn: "https://9f2ddc0b8fa48768054c21450b52ee90@o4511199536021504.ingest.de.sentry.io/4511199543820368",

  // ── Integrations ──────────────────────────────────────────────────────────
  // Replay is scoped to authenticated routes only (saves ~60 KB on public pages)
  integrations: isAuthenticatedRoute
    ? [
        Sentry.replayIntegration({
          // Mask all text and block all media to protect customer PII in replays
          maskAllText: true,
          blockAllMedia: true,
        }),
      ]
    : [],

  // ── Sampling ──────────────────────────────────────────────────────────────
  // 10% of traces in production, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // ── Logs ──────────────────────────────────────────────────────────────────
  enableLogs: true,

  // ── Session Replay ────────────────────────────────────────────────────────
  // Normal sessions: 10% (baseline metrics)
  replaysSessionSampleRate: 0.1,
  // Error sessions: 100% (always capture replays when something goes wrong)
  replaysOnErrorSampleRate: 1.0,

  // ── PII ───────────────────────────────────────────────────────────────────
  sendDefaultPii: true,

  // ── Environment ───────────────────────────────────────────────────────────
  environment: process.env.NODE_ENV || "development",

  // ── Filtering ─────────────────────────────────────────────────────────────
  ignoreErrors: [
    // Browser extension noise
    "ResizeObserver loop",
    "ResizeObserver loop completed with undelivered notifications",
    // Network errors from mobile users
    "TypeError: Failed to fetch",
    "TypeError: NetworkError",
    "TypeError: Load failed",
    "ChunkLoadError",
    // Clerk popup closed by user
    "ClerkRuntimeError",
    // Safari private browsing
    "QuotaExceededError",
  ],

  // ── Deny URLs ─────────────────────────────────────────────────────────────
  // Filter out errors from browser extensions and third-party scripts
  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
