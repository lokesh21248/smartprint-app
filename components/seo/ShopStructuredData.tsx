/**
 * ShopStructuredData — Server Component (no "use client" directive).
 *
 * CRITICAL: This must remain a server component.
 * "use client" would cause this script tag to be injected by JavaScript
 * after page load, making it invisible to Googlebot on the initial HTML response.
 * As a server component it is rendered into the static HTML payload,
 * which is what Google's crawler actually reads.
 */

interface ShopDisplayData {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  slug?: string;
  opening_time?: string;
  closing_time?: string;
  working_days?: string[];
  [key: string]: unknown;
}

/**
 * Maps working_days array to Schema.org day abbreviations.
 * E.g. ["Monday","Tuesday","Saturday"] → "Mo Tu Sa"
 */
function buildOpeningHours(
  opening: string,
  closing: string,
  workingDays: string[]
): string {
  const dayMap: Record<string, string> = {
    Monday: "Mo",
    Tuesday: "Tu",
    Wednesday: "We",
    Thursday: "Th",
    Friday: "Fr",
    Saturday: "Sa",
    Sunday: "Su",
  };
  const days =
    workingDays.length > 0
      ? workingDays.map((d) => dayMap[d] ?? d.slice(0, 2)).join(" ")
      : "Mo Tu We Th Fr Sa"; // sensible default for Indian shops
  return `${days} ${opening}-${closing}`;
}

export function ShopStructuredData({ shop }: { shop: ShopDisplayData }) {
  if (!shop || !shop.name) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://scan2paper.com";
  const shopUrl = `${appUrl}/s/${shop.slug}`;

  // ── LocalBusiness JSON-LD ─────────────────────────────────────────────────
  // Uses real DB address fields instead of placeholder "City" / "State"
  const localBusinessLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${shopUrl}#localbusiness`,
    name: shop.name,
    description: `${shop.name} is a local print shop offering online document upload, black & white printing, and colour printing via Scan2Paper.`,
    url: shopUrl,
    logo: {
      "@type": "ImageObject",
      url: `${appUrl}/logo.png`,
    },
    image: `${appUrl}/logo.png`,
    address: {
      "@type": "PostalAddress",
      streetAddress: shop.address ?? "",
      addressLocality: shop.city ?? "",
      addressRegion: shop.state ?? "",
      postalCode: shop.pincode ?? "",
      addressCountry: "IN",
    },
    telephone: shop.phone,
    openingHours: buildOpeningHours(
      shop.opening_time ?? "09:00",
      shop.closing_time ?? "21:00",
      (shop.working_days as string[]) ?? []
    ),
    priceRange: "₹",
    servesCuisine: undefined, // not applicable
    hasMap: `https://maps.google.com/?q=${encodeURIComponent(
      [shop.name, shop.address, shop.city, shop.state].filter(Boolean).join(", ")
    )}`,
  };

  // ── BreadcrumbList JSON-LD ────────────────────────────────────────────────
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${appUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Find a Shop",
        item: `${appUrl}/find-shop`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: shop.name,
        item: shopUrl,
      },
    ],
  };

  const safeStringify = (obj: unknown) =>
    JSON.stringify(obj)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeStringify(localBusinessLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeStringify(breadcrumbLd) }}
      />
    </>
  );
}
