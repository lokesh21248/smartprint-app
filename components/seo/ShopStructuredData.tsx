import type { Shop } from "@/types";

export function ShopStructuredData({ shop }: { shop: Partial<Shop> }) {
  if (!shop || !shop.name) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": shop.name,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": shop.address,
      "addressLocality": "City", // Placeholder
      "addressRegion": "State", // Placeholder
      "postalCode": "000000", // Placeholder
      "addressCountry": "IN"
    },
    "telephone": shop.phone,
    "url": `https://smartprint.in/s/${shop.slug}`,
    "openingHours": `${shop.opening_time}-${shop.closing_time}`,
    "priceRange": "₹"
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
