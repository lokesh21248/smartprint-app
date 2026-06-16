import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { HomeAuthRedirect } from "@/components/shared/HomeAuthRedirect";
import { allPosts, formatDate } from "@/lib/blog/posts";

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

      {/* Latest Articles Section with premium design & micro-animations */}
      <section aria-labelledby="blog-preview-heading" className="mt-24 max-w-5xl w-full px-4">
        <div className="text-center mb-10">
          <h2 id="blog-preview-heading" className="text-2xl font-extrabold text-gray-900 tracking-tight sm:text-3xl">
            Latest Articles
          </h2>
          <p className="mt-2 max-w-xl mx-auto text-sm text-gray-500">
            Insights, strategies, and guides to optimize your xerox shop operations and accelerate growth.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-none mx-auto text-left">
          {allPosts.slice(0, 3).map((post) => {
            const categoryColors: Record<string, string> = {
              "Print Shop Management": "bg-blue-50 text-blue-700 border-blue-100",
              "Online Printing": "bg-emerald-50 text-emerald-700 border-emerald-100",
              "Business Growth": "bg-amber-50 text-amber-700 border-amber-100",
              "QR Ordering": "bg-purple-50 text-purple-700 border-purple-100",
              "Customer Experience": "bg-rose-50 text-rose-700 border-rose-100",
            };
            const badgeColor = categoryColors[post.category] || "bg-gray-50 text-gray-700 border-gray-100";

            return (
              <article
                key={post.slug}
                className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md group"
              >
                <Link href={`/blog/${post.slug}`} className="block relative h-40 w-full overflow-hidden">
                  <Image
                    src={post.coverImage}
                    alt={post.coverImageAlt}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-black/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </Link>
                <div className="flex flex-1 flex-col justify-between p-5">
                  <div className="flex-1">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeColor}`}>
                      {post.category}
                    </span>
                    <Link href={`/blog/${post.slug}`} className="mt-3 block">
                      <h3 className="text-base font-bold text-gray-900 transition-colors duration-200 group-hover:text-emerald-600 leading-snug">
                        {post.title}
                      </h3>
                      <p className="mt-2 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {post.description}
                      </p>
                    </Link>
                  </div>
                  <div className="mt-5 flex items-center gap-2 text-xs text-gray-400 border-t border-gray-50 pt-3">
                    <time dateTime={post.date}>{formatDate(post.date)}</time>
                    <span>·</span>
                    <span>{post.readingTime}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center justify-center px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 hover:text-emerald-700 shadow-sm transition-all duration-200"
          >
            Explore all articles
            <svg className="ml-2 w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </section>

      <nav aria-label="Site links" className="mt-10 flex flex-wrap gap-6 justify-center text-sm text-gray-500">
        <Link href="/features" className="hover:text-emerald-700 transition">Features</Link>
        <Link href="/pricing" className="hover:text-emerald-700 transition">Pricing</Link>
        <Link href="/about" className="hover:text-emerald-700 transition">About</Link>
        <Link href="/blog" className="hover:text-emerald-700 transition">Blog</Link>
        <Link href="/contact" className="hover:text-emerald-700 transition">Contact</Link>
      </nav>
    </main>
  );
}

