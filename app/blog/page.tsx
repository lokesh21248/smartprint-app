import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog – Scan2Paper",
  description:
    "Tips, guides, and insights for print shop owners. Learn how to manage orders efficiently, grow your business, and use Scan2Paper to its full potential.",
  alternates: {
    canonical: "https://scan2paper.com/blog",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Blog – Scan2Paper",
    description:
      "Tips, guides, and insights for print shop owners. Learn how to grow your print business with Scan2Paper.",
    url: "https://scan2paper.com/blog",
    type: "website",
  },
};

// ---------------------------------------------------------------------------
// Blog post data
// In a real implementation, replace this with a CMS fetch (Contentful,
// Sanity, Notion, or a Supabase `blog_posts` table).
// Each post object must have a stable `slug` that matches /blog/[slug].
// ---------------------------------------------------------------------------
export const blogPosts = [
  {
    slug: "how-to-manage-print-orders-online",
    title: "How to Manage Print Orders Online with Scan2Paper",
    description:
      "A step-by-step guide to accepting, processing, and completing customer print orders using the Scan2Paper dashboard.",
    date: "2025-05-20",
    readingTime: "5 min read",
  },
  {
    slug: "upi-payments-for-xerox-shops",
    title: "Accepting UPI Payments in Your Xerox Shop",
    description:
      "How to collect payments via UPI, eliminate cash-handling hassle, and improve customer experience at your print shop.",
    date: "2025-05-10",
    readingTime: "4 min read",
  },
  {
    slug: "qr-code-shop-discovery",
    title: "QR Codes for Print Shops: Get More Customers Without Advertising",
    description:
      "Use a simple QR code to let customers find your shop, upload documents, and place orders — all from their phone.",
    date: "2025-04-28",
    readingTime: "3 min read",
  },
  {
    slug: "staff-management-for-print-shops",
    title: "Managing Staff at Your Print Shop",
    description:
      "Tips on adding staff members, assigning roles, and tracking performance so your shop runs smoothly even when you're away.",
    date: "2025-04-15",
    readingTime: "6 min read",
  },
  {
    slug: "increase-revenue-print-shop",
    title: "5 Ways to Increase Revenue at Your Print Shop",
    description:
      "Practical strategies for upselling, reducing wait times, and turning walk-in customers into repeat buyers.",
    date: "2025-04-01",
    readingTime: "7 min read",
  },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogIndexPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-4 py-16">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Scan2Paper Blog
          </h1>
          <p className="text-lg text-gray-600">
            Tips, guides, and insights for print shop owners across India.
          </p>
        </div>

        {/* Post list */}
        <div className="space-y-6">
          {blogPosts.map((post) => (
            <article
              key={post.slug}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition"
            >
              <Link href={`/blog/${post.slug}`} className="group block">
                <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-emerald-700 transition">
                  {post.title}
                </h2>
                <p className="text-gray-600 text-sm mb-3">{post.description}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  <span>·</span>
                  <span>{post.readingTime}</span>
                </div>
              </Link>
            </article>
          ))}
        </div>

        {/* Footer nav */}
        <nav
          aria-label="Site links"
          className="mt-12 flex flex-wrap gap-6 justify-center text-sm text-gray-500"
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
          <Link href="/contact" className="hover:text-emerald-700 transition">
            Contact
          </Link>
        </nav>
      </div>
    </main>
  );
}
