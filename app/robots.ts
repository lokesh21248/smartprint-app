import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard/",
        "/analytics/",
        "/settings/",
        "/profile/",
        "/staff/",
        "/shop-profile/",
        "/my-shop/",
        "/create-shop/",
        "/api/admin/",
        "/admin/",
      ],
    },
    sitemap: "https://scan2paper.com/sitemap.xml",
  };
}
