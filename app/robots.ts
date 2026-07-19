import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Allow Googlebot to crawl only the public marketing pages.
        // All authenticated, transactional, and utility paths are blocked
        // here as a belt-and-suspenders measure on top of per-page noindex.
        userAgent: "*",
        allow: [
          "/",
          "/features",
          "/pricing",
          "/about",
          "/contact",
          "/blog",
          "/blog/",
          "/blog/*",   // explicitly allow all blog article slugs
          "/find-shop", // explicitly allow the shop lookup page
          "/s/*",       // explicitly allow all individual shop profiles for local SEO
        ],
        disallow: [
          "/order/",      // transactional order-tracking pages
          "/order-upload/", // file-upload flow
          "/create-shop/",  // onboarding flow
          "/shop/",       // internal shop management
          "/dashboard/",  // authenticated app
          "/analytics/",  // authenticated app
          "/settings/",   // authenticated app
          "/staff/",      // authenticated app
          "/profile/",    // authenticated app
          "/admin/",      // admin panel
          "/api/",        // API endpoints
          "/auth/",       // auth helpers
          "/unauthorized/", // error page
        ],
      },
    ],
    sitemap: "https://scan2paper.com/sitemap.xml",
  };
}

