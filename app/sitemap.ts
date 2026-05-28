import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://scan2paper.com";

  // 1. Define base static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/find-shop`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  // 2. Fetch dynamically approved shops for SEO indexing
  let dynamicShopPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAdminClient();
    const { data: shops } = await supabase
      .from("shops")
      .select("slug, updated_at")
      .eq("is_approved", true)
      .order("updated_at", { ascending: false });

    if (shops && shops.length > 0) {
      dynamicShopPages = shops.map((shop) => ({
        url: `${baseUrl}/s/${shop.slug}`,
        lastModified: shop.updated_at ? new Date(shop.updated_at) : new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
      }));
    }
  } catch (err) {
    console.error("[Sitemap] Failed to fetch dynamic shop pages from Supabase:", err);
    // Return at least the static pages if Supabase is down or service key is missing during build/compilation
  }

  return [...staticPages, ...dynamicShopPages];
}
