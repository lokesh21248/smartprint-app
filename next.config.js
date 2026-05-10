/** @type {import('next').NextConfig} */

// ─────────────────────────────────────────────────────────────────────────────
// Content Security Policy
// Allows Clerk, Supabase Storage, and Cloudflare Turnstile.
// ─────────────────────────────────────────────────────────────────────────────
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval'
    https://*.clerk.accounts.dev
    https://*.clerk.com
    https://challenges.cloudflare.com;
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
    https://api.clerk.dev
    https://*.supabase.co
    https://*.supabase.in
    wss://*.supabase.co;
  frame-src https://challenges.cloudflare.com;
  media-src 'none';
  object-src 'none';
`.replace(/\n\s+/g, " ").trim();

const nextConfig = {
  // ── Security ───────────────────────────────────────────────────────────────
  poweredByHeader: false,

  // ── Build ──────────────────────────────────────────────────────────────────
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  output: "standalone", // Optimize for production deployments

  // ── Webpack ────────────────────────────────────────────────────────────────
  webpack: (config, { dev, isServer }) => {
    // Fix for p-limit async_hooks compatibility
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '#async_hooks': false,
    };

    // Deterministic module/chunk IDs help prevent hydration mismatches 
    // and "options.factory" runtime crashes during HMR.
    config.optimization.moduleIds = 'deterministic';
    config.optimization.chunkIds = 'deterministic';

    // Prevent the legacy `qrcode` package (which uses Node.js canvas)
    // from being bundled into client chunks — it causes options.factory crashes.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'qrcode': false,
      };
    }
    
    if (dev) {
      // Use memory cache to avoid disk locking issues (OneDrive safety)
      config.cache = {
        type: 'memory',
      };
      // More aggressive watchOptions for reliable HMR on virtual filesystems
      config.watchOptions = {
        poll: 800,
        aggregateTimeout: 200,
        ignored: ['**/.next/**', '**/node_modules/**'],
      };
    }
    
    return config;
  },

  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // ── Experimental ───────────────────────────────────────────────────────────
  experimental: {
    // optimizePackageImports has been temporarily disabled due to
    // "options.factory" and "Promise resolves to undefined"
    // Webpack chunk resolution crashes in Next.js 14 HMR.
  },

  // React strict mode (development_only: true by default in Next.js 14+)
  // Explicitly ensure it's enabled for additional safety checks
  reactStrictMode: true,

  // ── Images ─────────────────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
    // Serve modern formats for better performance
    formats: ["image/avif", "image/webp"],
  },

  // ── Compression ────────────────────────────────────────────────────────────
  compress: true,

  // ── HTTP Headers ───────────────────────────────────────────────────────────
  async headers() {
    return [
      // Security headers on every response
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
      // Long-lived CDN cache for static assets
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Public customer shop pages — cached at Vercel Edge for 5 minutes
      {
        source: "/s/:slug*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=600" },
        ],
      },
      // Presign + order-status endpoints — short cache for active orders
      {
        source: "/api/orders",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=10, stale-while-revalidate=30" },
        ],
      },
      // Dashboard + admin routes — never cache (private, authenticated)
      {
        source: "/(dashboard|admin|api/admin)(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;


// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "new-startup-bi",
  project: "react-native",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
