import { MetadataRoute } from "next";
import { allPosts } from "@/lib/blog/posts";
import { createAdminClient } from "@/lib/supabase/admin";


// Static sitemap — only include pages that are:
//   1. Publicly accessible (no auth required)
//   2. Have unique, non-thin content
//   3. Are NOT set to noindex in their page/layout metadata
//
// RULE: Never include noindex pages in the sitemap.
// Mixing sitemap inclusion with noindex metadata sends Google conflicting signals
// (Google Search Central anti-pattern).
export const dynamic = "force-static";
export const revalidate = 86400; // Rebuild at most once per day (CDN cache)

const BASE_URL = "https://scan2paper.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static marketing pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/features`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/find-shop`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  // Blog post pages — sourced from lib/blog/posts (single source of truth)
  // so the sitemap is always in sync with published content.
  const blogPages: MetadataRoute.Sitemap = allPosts.map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.updatedDate ?? post.date),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Active Shop pages — fetched from the database at build time (and revalidated)
  let shopPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAdminClient();
    const { data: shops } = await supabase
      .from("shops")
      .select("slug, updated_at")
      .eq("is_active", true)
      .eq("is_approved", true);

    if (shops && shops.length > 0) {
      shopPages = shops.map((shop) => ({
        url: `${BASE_URL}/s/${shop.slug}`,
        lastModified: shop.updated_at ? new Date(shop.updated_at) : new Date(),
        changeFrequency: "daily" as const,
        priority: 0.6,
      }));
    }
  } catch (error) {
    console.error("Failed to fetch shops for sitemap:", error);
  }

  return [...staticPages, ...blogPages, ...shopPages];
}


