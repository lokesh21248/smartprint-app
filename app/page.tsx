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
  const postsData = allPosts.slice(0, 3).map((post) => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    category: post.category,
    coverImage: post.coverImage,
    coverImageAlt: post.coverImageAlt,
    date: post.date,
    readingTime: post.readingTime,
  }));

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            try {
              if (localStorage.getItem('scan2paper_visited') || document.cookie.indexOf('__session') !== -1) {
                document.documentElement.classList.add('js-redirecting');
              }
            } catch (e) {}
          `,
        }}
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .redirect-overlay {
              display: none;
            }
            .js-redirecting .redirect-overlay {
              display: flex !important;
              position: fixed;
              inset: 0;
              background: linear-gradient(to bottom right, #f0fdf4, #ffffff, #eff6ff);
              z-index: 99999;
              align-items: center;
              justify-content: center;
              flex-direction: column;
            }
            .js-redirecting main {
              display: none !important;
            }
          `,
        }}
      />
      <div className="redirect-overlay">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin" />
          <p className="text-gray-600 font-semibold text-base animate-pulse">
            Redirecting you...
          </p>
        </div>
      </div>
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
        <LatestArticles posts={postsData} />

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

