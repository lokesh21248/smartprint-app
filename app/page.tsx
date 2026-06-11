import type { Metadata } from "next";
import Link from "next/link";
import { HomeAuthRedirect } from "@/components/shared/HomeAuthRedirect";

// Static page rendered at build time, revalidated every hour (ISR).
// Authenticated-user → /dashboard redirect happens in middleware at the
// Vercel edge, so this page never needs to call auth() or force SSR.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Scan2Paper – Digital Print Shop Management",
  description:
    "Scan2Paper helps print shop owners manage orders, documents, staff, and revenue from one powerful dashboard. Customers can upload documents online and collect their prints quickly and efficiently.",
  alternates: {
    canonical: "https://scan2paper.com/",
  },
  openGraph: {
    title: "Scan2Paper – Digital Print Shop Management",
    description:
      "Manage your print shop orders, staff, and analytics from one powerful dashboard. Join Scan2Paper today.",
    url: "https://scan2paper.com/",
    type: "website",
  },
};

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-4 py-16 text-center">
      {/* Client-side redirect for authenticated users — keeps this page static/CDN-cacheable */}
      <HomeAuthRedirect />
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        Digital Print Shop Management
      </h1>
      <p className="text-lg text-gray-600 max-w-xl mb-8">
        Scan2Paper helps print shop owners manage orders, documents, staff, and
        revenue from one powerful dashboard. Customers can upload documents
        online and collect their prints quickly and efficiently.
      </p>
      <div className="flex flex-wrap gap-4 justify-center">
        <Link
          href="/login"
          className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition"
        >
          Sign In to Dashboard
        </Link>
        <Link
          href="/features"
          className="px-6 py-3 border border-emerald-600 text-emerald-700 rounded-xl font-semibold hover:bg-emerald-50 transition"
        >
          See Features
        </Link>
      </div>
      <nav aria-label="Site links" className="mt-10 flex flex-wrap gap-6 justify-center text-sm text-gray-500">
        <Link href="/features" className="hover:text-emerald-700 transition">Features</Link>
        <Link href="/pricing" className="hover:text-emerald-700 transition">Pricing</Link>
        <Link href="/about" className="hover:text-emerald-700 transition">About</Link>
        <Link href="/contact" className="hover:text-emerald-700 transition">Contact</Link>
      </nav>
    </main>
  );
}

