'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { type Category, formatDate } from "@/lib/blog/posts";

interface LatestArticle {
  slug: string;
  title: string;
  description: string;
  category: Category;
  coverImage: string;
  coverImageAlt: string;
  date: string;
  readingTime: string;
}

interface LatestArticlesProps {
  posts: LatestArticle[];
}

// Static lookup — defined once, not recreated on every render or map iteration
const CATEGORY_COLORS: Record<string, string> = {
  "Print Shop Management": "bg-blue-50 text-blue-700 border-blue-100",
  "Online Printing": "bg-emerald-50 text-emerald-700 border-emerald-100",
  "Business Growth": "bg-amber-50 text-amber-700 border-amber-100",
  "QR Ordering": "bg-purple-50 text-purple-700 border-purple-100",
  "Customer Experience": "bg-rose-50 text-rose-700 border-rose-100",
};

export function LatestArticles({ posts }: LatestArticlesProps) {
  const [showArticles, setShowArticles] = useState(false);

  useEffect(() => {
    const hasSeenArticles = localStorage.getItem("scan2paper_articles_seen");

    if (!hasSeenArticles) {
      setShowArticles(true);
      localStorage.setItem("scan2paper_articles_seen", "true");
    }
  }, []);

  if (!showArticles) {
    return null;
  }

  return (
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
        {posts.map((post, index) => {
          const badgeColor = CATEGORY_COLORS[post.category] || "bg-gray-50 text-gray-700 border-gray-100";

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
                  // Only the first card is above-the-fold; rest load lazily
                  priority={index === 0}
                  loading={index === 0 ? "eager" : "lazy"}
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
  );
}
