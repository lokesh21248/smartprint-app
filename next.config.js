/** @type {import('next').NextConfig} */

// ─────────────────────────────────────────────────────────────────────────────
// Content Security Policy
// ─────────────────────────────────────────────────────────────────────────────
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval'
    https://*.clerk.accounts.dev
    https://*.clerk.com
    https://clerk.scan2paper.com
    https://challenges.cloudflare.com
    https://static.cloudflareinsights.com
    https://cloudflareinsights.com
    https://va.vercel-scripts.com;
  style-src 'self' 'unsafe-inline'
    https://fonts.googleapis.com;
  img-src 'self' data: blob:
    https://*.supabase.co
    https://*.supabase.in;
  font-src 'self'
    https://fonts.gstatic.com;
  worker-src 'self' blob:;
  connect-src 'self'
    https://*.clerk.accounts.dev
    https://*.clerk.com
    https://clerk.scan2paper.com
    https://api.clerk.dev
    https://clerk-telemetry.com
    https://*.supabase.co
    https://*.supabase.in
    wss://*.supabase.co
    https://monitoring.scan2paper.com
    https://static.cloudflareinsights.com
    https://cloudflareinsights.com
    https://vitals.vercel-insights.com
    https://va.vercel-scripts.com;
  frame-src https://challenges.cloudflare.com
    https://*.clerk.com
    https://clerk.scan2paper.com;
  media-src 'self';
  object-src 'none';
`.replace(/\n\s+/g, " ").trim();

const isDev = process.env.NODE_ENV !== "production";

const nextConfig = {
  env: {
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/login",
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/signup",
  },
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // ── output: "standalone" is PRODUCTION-ONLY ────────────────────────────────
  // In dev, standalone mode changes how Next.js traces modules and can cause
  // chunk manifest/factory mismatches after HMR updates.
  // Only enable for production where it optimises Vercel/Docker deployments.
  // Disable on Windows to avoid filesystem path length/symlink creation bugs (e.g. OneDrive).
  ...((isDev || process.platform === "win32") ? {} : { output: "standalone" }),

  // ── Webpack ────────────────────────────────────────────────────────────────
  webpack: (config, { dev, isServer }) => {
    // Fix p-limit / @supabase async_hooks compatibility in all envs.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '#async_hooks': false,
    };

    // Block legacy `qrcode` (Node.js canvas) from entering client bundles.
    // Only apply in production — in dev the alias can disrupt module graph.
    if (!dev && !isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'qrcode': false,
      };
    }

    // ── PRODUCTION ONLY: stable chunk IDs ─────────────────────────────────
    // NEVER set in dev: Next.js + React Refresh requires 'named' module IDs
    // during HMR so it can find and hot-swap the exact module that changed.
    // Forcing 'deterministic' in dev → React Refresh loses module references
    // → options.factory === undefined after any Fast Refresh update.
    if (!dev) {
      config.optimization.moduleIds = 'deterministic';
      config.optimization.chunkIds = 'deterministic';
    }

    // ── DEVELOPMENT: minimal watch options ────────────────────────────────
    // Use a longer aggregateTimeout to prevent overlapping recompilations
    // on OneDrive (network FS). Overlapping compilations produce out-of-sync
    // chunk manifests → options.factory undefined.
    // Do NOT set poll here — Next.js uses native fsevents/chokidar by default
    // which is more reliable. Polling causes double-trigger recompilations.
    if (dev) {
      config.watchOptions = {
        aggregateTimeout: 500,
        ignored: ['**/.next/**', '**/node_modules/**'],
      };
    }

    return config;
  },

  logging: {
    fetches: { fullUrl: true },
  },

  // optimizePackageImports causes options.factory / mountLazyComponent crashes.
  experimental: {},

  reactStrictMode: true,

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  compress: true,

  async redirects() {
    return [];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: ContentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/_next/static/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/s/:slug*",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=600" }],
      },
      {
        source: "/api/orders",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=10, stale-while-revalidate=30" }],
      },
      {
        source: "/(dashboard|admin|api/admin)(.*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sentry — PRODUCTION ONLY
//
// @sentry/nextjs v10's webpack plugin injects module wrappers that conflict
// with Next.js's dev HMR graph. Runtime error capture (instrumentation-client.ts
// + instrumentation.ts) still works in both envs without the webpack plugin.
// ─────────────────────────────────────────────────────────────────────────────
if (!isDev) {
  const { withSentryConfig } = require("@sentry/nextjs");
  module.exports = withSentryConfig(nextConfig, {
    org: "new-startup-bi",
    project: "react-native",
    silent: !process.env.CI,
    widenClientFileUpload: true,
    tunnelRoute: "/monitoring",
    webpack: {
      treeshake: { removeDebugLogging: true },
    },
  });
} else {
  module.exports = nextConfig;
}
