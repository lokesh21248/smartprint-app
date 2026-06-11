import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  allPosts,
  getPostBySlug,
  getRelatedPosts,
  formatDate,
} from "@/lib/blog/posts";
import { ArticleRenderer } from "@/components/blog/ArticleRenderer";

// ---------------------------------------------------------------------------
// Static generation — pre-render every blog post at build time
// ---------------------------------------------------------------------------
export function generateStaticParams() {
  return allPosts.map((p) => ({ slug: p.slug }));
}

// ---------------------------------------------------------------------------
// Per-article SEO metadata
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = getPostBySlug(params.slug);

  if (!post) {
    return {
      title: "Post Not Found | Scan2Paper Blog",
      robots: { index: false, follow: true },
    };
  }

  const url = `https://scan2paper.com/blog/${post.slug}`;

  return {
    title: post.metaTitle,
    description: post.metaDescription,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      url,
      type: "article",
      publishedTime: post.date,
      modifiedTime: post.updatedDate ?? post.date,
      images: [
        {
          url: `https://scan2paper.com${post.coverImage}`,
          width: 1200,
          height: 630,
          alt: post.coverImageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.metaTitle,
      description: post.metaDescription,
      images: [`https://scan2paper.com${post.coverImage}`],
    },
  };
}

// ---------------------------------------------------------------------------
// Article page
// ---------------------------------------------------------------------------
export default function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = getPostBySlug(params.slug);
  if (!post) notFound();

  const relatedPosts = getRelatedPosts(post.slug, post.category, 2);

  // JSON-LD Article structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription,
    datePublished: post.date,
    dateModified: post.updatedDate ?? post.date,
    image: `https://scan2paper.com${post.coverImage}`,
    author: {
      "@type": "Organization",
      name: "Scan2Paper",
      url: "https://scan2paper.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Scan2Paper",
      url: "https://scan2paper.com",
      logo: {
        "@type": "ImageObject",
        url: "https://scan2paper.com/logo.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://scan2paper.com/blog/${post.slug}`,
    },
  };

  // JSON-LD BreadcrumbList
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://scan2paper.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: "https://scan2paper.com/blog",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: `https://scan2paper.com/blog/${post.slug}`,
      },
    ],
  };

  return (
    <>
      {/* Structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50">
        {/* Hero image */}
        <div className="relative w-full h-56 sm:h-72 md:h-80">
          <Image
            src={post.coverImage}
            alt={post.coverImageAlt}
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          {/* Breadcrumb over image */}
          <nav
            aria-label="Breadcrumb"
            className="absolute bottom-4 left-4 right-4 text-sm text-white/80 flex items-center gap-1.5"
          >
            <Link href="/" className="hover:text-white transition">Home</Link>
            <span>›</span>
            <Link href="/blog" className="hover:text-white transition">Blog</Link>
            <span>›</span>
            <span className="text-white truncate">{post.title}</span>
          </nav>
        </div>

        <main className="px-4 py-10">
          <div className="max-w-2xl mx-auto">
            {/* Article header */}
            <header className="mb-8">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 mb-4">
                {post.category}
              </span>
              <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">
                {post.title}
              </h1>
              <p className="text-gray-600 text-base mb-4 leading-relaxed">
                {post.description}
              </p>
              <div className="flex items-center gap-3 text-sm text-gray-400 border-t border-gray-100 pt-4">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <span>·</span>
                <span>{post.readingTime}</span>
                <span>·</span>
                <span>By Scan2Paper Team</span>
              </div>
            </header>

            {/* Article body */}
            <article>
              <ArticleRenderer blocks={post.content} />
            </article>

            {/* CTA block */}
            <div className="mt-12 p-6 bg-emerald-600 rounded-2xl text-white text-center">
              <h2 className="text-xl font-bold mb-2">
                Ready to digitalise your print shop?
              </h2>
              <p className="text-emerald-100 text-sm mb-4">
                Join hundreds of xerox shops across India using Scan2Paper to
                manage orders, streamline print workflows, and grow their business.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Link
                  href="/login"
                  className="px-6 py-2.5 bg-white text-emerald-700 rounded-xl font-semibold hover:bg-emerald-50 transition text-sm"
                >
                  Get Started Free
                </Link>
                <Link
                  href="/features"
                  className="px-6 py-2.5 border border-emerald-400 text-white rounded-xl font-semibold hover:bg-emerald-700 transition text-sm"
                >
                  See Features
                </Link>
              </div>
            </div>

            {/* Related posts */}
            {relatedPosts.length > 0 && (
              <section className="mt-12" aria-labelledby="related-heading">
                <h2
                  id="related-heading"
                  className="text-lg font-bold text-gray-900 mb-4"
                >
                  Related Articles
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {relatedPosts.map((related) => (
                    <Link
                      key={related.slug}
                      href={`/blog/${related.slug}`}
                      className="group block bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition"
                    >
                      <span className="text-xs text-emerald-600 font-medium">
                        {related.category}
                      </span>
                      <h3 className="text-sm font-semibold text-gray-900 mt-1 group-hover:text-emerald-700 transition leading-snug">
                        {related.title}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1">
                        {related.readingTime}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Internal links footer */}
            <nav
              aria-label="Site links"
              className="mt-10 pt-6 border-t border-gray-100 flex flex-wrap gap-4 text-sm text-gray-500"
            >
              <Link href="/" className="hover:text-emerald-700 transition">Home</Link>
              <Link href="/features" className="hover:text-emerald-700 transition">Features</Link>
              <Link href="/pricing" className="hover:text-emerald-700 transition">Pricing</Link>
              <Link href="/contact" className="hover:text-emerald-700 transition">Contact</Link>
              <Link href="/blog" className="hover:text-emerald-700 transition">← All Articles</Link>
            </nav>
          </div>
        </main>
      </div>
    </>
  );
}
