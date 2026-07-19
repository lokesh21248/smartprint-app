import type { Metadata } from "next";
import Link from "next/link";
import { HomeAuthRedirect } from "@/components/shared/HomeAuthRedirect";
import { LatestArticles } from "@/components/shared/LatestArticles";
import { allPosts } from "@/lib/blog/posts";

// Static page rendered at build time, revalidated every hour (ISR).
// Authenticated-user → /dashboard redirect happens in middleware at the
// Vercel edge, so this page never needs to call auth() or force SSR.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Scan2Paper – Print Shop Management Software & Digital Ordering",
  description:
    "Manage your print shop with Scan2Paper's Xerox shop software. Accept online orders, enable PDF document upload, and increase revenue. Start for free.",
  alternates: {
    canonical: "https://scan2paper.com/",
  },
  openGraph: {
    title: "Scan2Paper – Print Shop Management Software & Digital Ordering",
    description:
      "Manage your print shop with Scan2Paper's Xerox shop software. Accept online orders, enable PDF document upload, and increase revenue. Start for free.",
    url: "https://scan2paper.com/",
    type: "website",
  },
};

// JSON-LD structured data — helps search engines understand the site and
// enables rich results (sitelinks, knowledge panel, etc.)
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://scan2paper.com/#website",
      "url": "https://scan2paper.com",
      "name": "Scan2Paper",
      "description": "Digital Print Shop Management Platform",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://scan2paper.com/blog?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": "https://scan2paper.com/#organization",
      "name": "Scan2Paper",
      "alternateName": ["Scan Paper", "Scan To Paper"],
      "url": "https://scan2paper.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://scan2paper.com/logo.webp",
        "width": 512,
        "height": 512,
      },
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "support@scan2paper.com",
        "contactType": "customer support",
      },
      "sameAs": [],
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://scan2paper.com/#software",
      "name": "Scan2Paper",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Any",
      "url": "https://scan2paper.com",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "INR"
      },
    },
    {
      "@type": "WebPage",
      "@id": "https://scan2paper.com/#webpage",
      "url": "https://scan2paper.com/",
      "name": "Scan2Paper – Digital Print Shop Management",
      "isPartOf": { "@id": "https://scan2paper.com/#website" },
      "about": { "@id": "https://scan2paper.com/#organization" },
      "description": "Scan2Paper helps print shop owners manage orders, documents, staff, and revenue from one powerful dashboard.",
    },
  ],
};

// Slice posts at module evaluation time — avoids re-slicing on every ISR
// revalidation when the post list hasn't changed.
const latestPosts = allPosts.slice(0, 3).map((post) => ({
  slug: post.slug,
  title: post.title,
  description: post.description,
  category: post.category,
  coverImage: post.coverImage,
  coverImageAlt: post.coverImageAlt,
  date: post.date,
  readingTime: post.readingTime,
}));

export default function Home() {
  return (
    <>
      {/* JSON-LD structured data — rendered in document head by Next.js */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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

        {/* Latest Articles Section — Server Component: no CLS, always indexed by Googlebot */}
        <LatestArticles posts={latestPosts} />

        <nav aria-label="Site links" className="mt-10 flex flex-wrap gap-6 justify-center text-sm text-gray-500">
          <Link href="/features" className="hover:text-emerald-700 transition">Features</Link>
          <Link href="/pricing" className="hover:text-emerald-700 transition">Pricing</Link>
          <Link href="/about" className="hover:text-emerald-700 transition">About</Link>
          <Link href="/blog" className="hover:text-emerald-700 transition">Blog</Link>
          <Link href="/contact" className="hover:text-emerald-700 transition">Contact</Link>
        </nav>
      </main>
    </>
  );
}
