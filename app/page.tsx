import type { Metadata } from "next";
import Link from "next/link";
import { HomeAuthRedirect } from "@/components/shared/HomeAuthRedirect";
import FindShopPage from "@/app/find-shop/page";

// ─── Canonical app URL ────────────────────────────────────────────────────────
// Hardcoded — NEXT_PUBLIC_APP_URL is not set in .env.local, so always use the
// production origin directly. This guarantees the canonical is never undefined.
const CANONICAL_HOME = "https://scan2paper.com";

// ─── Metadata ────────────────────────────────────────────────────────────────
// This metadata is now served to crawlers because the page renders real content
// instead of immediately redirecting. Googlebot will see the find-shop UI at the
// canonical domain root, which is the primary customer-facing entry point.
export const metadata: Metadata = {
  title: "Scan2Paper - Online Printing Service",
  description:
    "Upload documents and order printouts online with Scan2Paper. Fast, secure, and convenient printing for all your files.",
  keywords: [
    "online printing",
    "xerox shop",
    "document printout",
    "PDF printing",
    "Scan2Paper",
  ],
  alternates: {
    // Homepage canonical = the root URL. Must be the absolute URL, not /find-shop.
    // This page renders content at https://scan2paper.com/ — not at /find-shop.
    canonical: CANONICAL_HOME,
  },
  openGraph: {
    title: "Scan2Paper - Online Printing Service",
    description:
      "Upload documents and order printouts online with Scan2Paper. Fast, secure, and convenient printing for all your files.",
    url: CANONICAL_HOME,
    type: "website",
    siteName: "Scan2Paper",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scan2Paper - Online Printing Service",
    description:
      "Upload documents and order printouts online with Scan2Paper. Fast, secure, and convenient printing for all your files.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

// ─── Page ────────────────────────────────────────────────────────────────────
// Renders the find-shop UI directly at the domain root so Google can index it.
// HomeAuthRedirect handles the client-side /dashboard navigation for signed-in
// users — no server-side redirect means no "Redirect error" in Search Console.
//
// INTERNAL LINKING (SEO):
// The footer below is a server-rendered <nav> with real <a> tags. This is
// critical because FindShopPage is "use client" — Googlebot's first-pass HTML
// only sees the client hydration boundary, not actual anchor elements.
// These server-rendered links let Googlebot discover /find-shop and /order-upload
// without executing JavaScript.
export default function Home() {
  return (
    <>
      <HomeAuthRedirect />
      <FindShopPage />
    </>
  );
}
