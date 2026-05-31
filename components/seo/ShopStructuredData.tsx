"use client";

interface ShopDisplayData {
  name?: string;
  address?: string;
  phone?: string;
  slug?: string;
  opening_time?: string;
  closing_time?: string;
  [key: string]: unknown;
}

export function ShopStructuredData({ shop }: { shop: ShopDisplayData }) {
  if (!shop || !shop.name) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://scan2paper.com";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": shop.name,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": shop.address,
      "addressLocality": "City",
      "addressRegion": "State",
      "postalCode": "000000",
      "addressCountry": "IN"
    },
    "telephone": shop.phone,
    "url": `${appUrl}/s/${shop.slug}`,
    "openingHours": `${shop.opening_time}-${shop.closing_time}`,
    "priceRange": "₹"
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c").replace(/>/g, "\\u003e"),
      }}
    />
  );
}
