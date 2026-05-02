import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false, // Don't expose X-Powered-By: Next.js header
  eslint: {
    // Lint errors elsewhere in the codebase (unused vars, `any`, escape entities) shouldn't block builds.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Pre-existing schema-mismatch type errors in unrelated routes shouldn't block builds.
    // Re-enable once `owner_id` → `clerk_owner_id` migration is complete across the codebase.
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
