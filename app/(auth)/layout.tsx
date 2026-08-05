import type { Metadata } from "next";
import { Scan2PaperLogo } from "@/components/shared/Scan2PaperLogo";

// ── SEO: Auth pages must NEVER be indexed ────────────────────────────────────
// These are utility pages (sign-in, sign-up, password reset) that contain no
// crawlable public content. Indexing them causes the GSC "Page indexed without
// content" warning because Clerk renders its UI entirely via JavaScript.
//
// Three-layer defence:
//   1. robots: { index: false, follow: false } → <meta name="robots"> in <head>
//   2. alternates.canonical → https://scan2paper.com (overrides any inherited
//      canonical so Google associates this subdomain with the main domain)
//   3. X-Robots-Tag: noindex, nofollow → HTTP header in next.config.js headers()
//
// The canonical points to the main domain rather than a specific auth page
// because there is no public-facing canonical equivalent for /login.
export const metadata: Metadata = {
  title: {
    default: "Sign In | Scan2Paper",
    template: "%s | Scan2Paper",
  },
  description:
    "Sign in to your Scan2Paper shop owner panel to manage orders, staff, and analytics.",
  robots: {
    index: false,
    follow: false, // nofollow: no link equity to pass from auth utility pages
    googleBot: {
      index: false,
      follow: false,
    },
  },
  // Canonical points to the main domain — prevents Google treating the Clerk
  // subdomain (clerk.scan2paper.com) as a separate indexable entity.
  alternates: {
    canonical: "https://scan2paper.com",
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E8F5EE] via-white to-[#E8F1F8] flex items-center justify-center p-4">
      {/* Belt-and-suspenders: inline meta tag for JS-rendered environments
          where the HTTP X-Robots-Tag header may not yet have been received. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta name="robots" content="noindex, nofollow" />

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-[#2E8B57]/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-[#1F4E79]/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-[440px]">
        {/* Brand */}
        <div className="flex flex-col items-center justify-center mb-6">
          <Scan2PaperLogo variant="full" size={46} color="color" />
          <p className="text-[13px] text-[#6B7280] mt-1.5">Shop Owner Panel</p>
        </div>
        {children}
      </div>
    </div>
  );
}
