import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://scan2paper.com";

  // 1. Public indexable static pages ONLY.
  // RULE: Never include pages that have robots: { index: false } in the sitemap.
  // /login and /signup are noindex (auth pages) — excluded intentionally.
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/find-shop`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/order-upload`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
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
