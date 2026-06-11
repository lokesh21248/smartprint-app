import type { Metadata } from "next";
import Link from "next/link";
import { allPosts } from "@/lib/blog/posts";
import { BlogClientPage } from "@/components/blog/BlogClientPage";

export const metadata: Metadata = {
  title: "Blog – Print Shop Management Tips & Guides | Scan2Paper",
  description:
    "Tips, guides, and insights for xerox shop owners and print shop businesses in India. Learn about online ordering, QR codes, document uploads, and shop management.",
  alternates: {
    canonical: "https://scan2paper.com/blog",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Blog – Print Shop Management Tips & Guides | Scan2Paper",
    description:
      "Practical guides for Indian xerox shop owners — online ordering, QR code ordering, document management, and revenue growth strategies.",
    url: "https://scan2paper.com/blog",
    type: "website",
  },
};

// This is a Server Component — it passes data to the Client Component for filtering.
// The page is statically rendered at build time (no auth, no user-specific data).
export default function BlogIndexPage() {
  const featuredPost = allPosts.find((p) => p.featured) ?? allPosts[0];

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-4 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Scan2Paper Blog
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Practical guides, tips, and strategies for xerox shop owners and
            print businesses across India.
          </p>
        </div>

        {/* Client component handles search + filter + rendering */}
        <BlogClientPage posts={allPosts} featuredPost={featuredPost} />

        {/* Site navigation */}
        <nav
          aria-label="Site links"
          className="mt-14 flex flex-wrap gap-6 justify-center text-sm text-gray-500"
        >
          <Link href="/" className="hover:text-emerald-700 transition">
            Home
          </Link>
          <Link href="/features" className="hover:text-emerald-700 transition">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-emerald-700 transition">
            Pricing
          </Link>
          <Link href="/about" className="hover:text-emerald-700 transition">
            About
          </Link>
          <Link href="/contact" className="hover:text-emerald-700 transition">
            Contact
          </Link>
        </nav>
      </div>
    </main>
  );
}
