"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { type BlogPost, type Category, formatDate } from "@/lib/blog/posts";

const CATEGORIES: Category[] = [
  "Print Shop Management",
  "Online Printing",
  "Business Growth",
  "QR Ordering",
  "Customer Experience",
];

const CATEGORY_COLORS: Record<Category, string> = {
  "Print Shop Management": "bg-blue-100 text-blue-700",
  "Online Printing": "bg-emerald-100 text-emerald-700",
  "Business Growth": "bg-amber-100 text-amber-700",
  "QR Ordering": "bg-purple-100 text-purple-700",
  "Customer Experience": "bg-rose-100 text-rose-700",
};

interface Props {
  posts: BlogPost[];
  featuredPost: BlogPost;
}

export function BlogClientPage({ posts, featuredPost }: Props) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");

  const filtered = useMemo(() => {
    return posts.filter((p) => {
      const matchesCategory =
        activeCategory === "All" || p.category === activeCategory;
      const q = query.toLowerCase();
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [posts, query, activeCategory]);

  // Exclude featured post from the regular grid when no filter is active
  const gridPosts =
    query === "" && activeCategory === "All"
      ? filtered.filter((p) => p.slug !== featuredPost.slug)
      : filtered;

  const showFeatured = query === "" && activeCategory === "All";

  return (
    <div>
      {/* ---- Search bar ---- */}
      <div className="mb-8">
        <input
          type="search"
          placeholder="Search articles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
          aria-label="Search blog articles"
        />
      </div>

      {/* ---- Category filter ---- */}
      <div className="flex flex-wrap gap-2 mb-10">
        <button
          onClick={() => setActiveCategory("All")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
            activeCategory === "All"
              ? "bg-emerald-600 text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-400"
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              activeCategory === cat
                ? "bg-emerald-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-400"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ---- Featured article ---- */}
      {showFeatured && (
        <Link href={`/blog/${featuredPost.slug}`} className="group block mb-10">
          <article className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition">
            <div className="relative h-52 sm:h-64 w-full">
              <Image
                src={featuredPost.coverImage}
                alt={featuredPost.coverImageAlt}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 768px) 100vw, 800px"
              />
              <span className="absolute top-4 left-4 px-3 py-1 bg-emerald-600 text-white text-xs font-semibold rounded-full">
                Featured
              </span>
            </div>
            <div className="p-6">
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium mb-3 ${
                  CATEGORY_COLORS[featuredPost.category]
                }`}
              >
                {featuredPost.category}
              </span>
              <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-emerald-700 transition">
                {featuredPost.title}
              </h2>
              <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                {featuredPost.description}
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <time dateTime={featuredPost.date}>
                  {formatDate(featuredPost.date)}
                </time>
                <span>·</span>
                <span>{featuredPost.readingTime}</span>
              </div>
            </div>
          </article>
        </Link>
      )}

      {/* ---- Article grid ---- */}
      {gridPosts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {gridPosts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="group block">
              <article className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition h-full flex flex-col">
                <div className="relative h-40 w-full">
                  <Image
                    src={post.coverImage}
                    alt={post.coverImageAlt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 400px"
                  />
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium mb-2 w-fit ${
                      CATEGORY_COLORS[post.category]
                    }`}
                  >
                    {post.category}
                  </span>
                  <h2 className="text-base font-semibold text-gray-900 mb-1.5 group-hover:text-emerald-700 transition leading-snug">
                    {post.title}
                  </h2>
                  <p className="text-gray-500 text-xs mb-3 line-clamp-2 flex-1">
                    {post.description}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-auto">
                    <time dateTime={post.date}>{formatDate(post.date)}</time>
                    <span>·</span>
                    <span>{post.readingTime}</span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg font-medium mb-1">No articles found</p>
          <p className="text-sm">
            Try a different search term or category.
          </p>
        </div>
      )}
    </div>
  );
}
