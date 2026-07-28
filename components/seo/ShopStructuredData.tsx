/**
 * ShopStructuredData — Server Component (no "use client" directive).
 *
 * CRITICAL: Must remain a server component. Adding "use client" would inject
 * the script tag via JS after page load, making it invisible to Googlebot on
 * the initial HTML response.
 */

// ── Constants lifted to module scope — only computed once per process ──────
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://scan2paper.com";
const LOGO_URL = `${APP_URL}/logo.png`;

// Schema.org day abbreviation map — frozen so it is never mutated
const DAY_MAP: Readonly<Record<string, string>> = Object.freeze({
  Monday: "Mo",
  Tuesday: "Tu",
  Wednesday: "We",
  Thursday: "Th",
  Friday: "Fr",
  Saturday: "Sa",
  Sunday: "Su",
});

const DEFAULT_WORKING_DAYS = "Mo Tu We Th Fr Sa"; // sensible default for Indian shops

/** Encodes JSON-LD safely for inline <script> — prevents XSS via </script> injection */
const safeStringify = (obj: unknown): string =>
  JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

/**
 * Maps a working_days array to Schema.org openingHours format.
 * E.g. ["Monday","Saturday"] → "Mo Sa 09:00-21:00"
 */
function buildOpeningHours(
  opening: string,
  closing: string,
  workingDays: readonly string[]
): string {
  const days =
    workingDays.length > 0
      ? workingDays.map((d) => DAY_MAP[d] ?? d.slice(0, 2)).join(" ")
      : DEFAULT_WORKING_DAYS;
  return `${days} ${opening}-${closing}`;
}

// ── Strict prop types — removes index signature so callers get type-checking ─
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
}

export function ShopStructuredData({ shop }: { shop: ShopDisplayData }) {
  if (!shop.name || !shop.slug) return null;

  const shopUrl = `${APP_URL}/s/${shop.slug}`;

  // Build the Google Maps search URL once
  const mapsQuery = encodeURIComponent(
    [shop.name, shop.address, shop.city, shop.state].filter(Boolean).join(", ")
  );

  // ── LocalBusiness JSON-LD ─────────────────────────────────────────────────
  const localBusinessLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${shopUrl}#localbusiness`,
    name: shop.name,
    description: `${shop.name} is a local print shop offering online document upload, black & white printing, and colour printing via Scan2Paper.`,
    url: shopUrl,
    logo: { "@type": "ImageObject", url: LOGO_URL },
    image: LOGO_URL,
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
      shop.working_days ?? []
    ),
    priceRange: "₹",
    hasMap: `https://maps.google.com/?q=${mapsQuery}`,
  };

  // ── BreadcrumbList JSON-LD ────────────────────────────────────────────────
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${APP_URL}/` },
      { "@type": "ListItem", position: 2, name: "Find a Shop", item: `${APP_URL}/find-shop` },
      { "@type": "ListItem", position: 3, name: shop.name, item: shopUrl },
    ],
  };

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
