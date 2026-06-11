import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopStructuredData } from "@/components/seo/ShopStructuredData";

// ISR: revalidate shop layout data every 5 minutes.
// Vercel Edge will serve the cached HTML to ALL customers globally
// without hitting Supabase on every request.
export const revalidate = 300;

const BASE_URL = "https://scan2paper.com";

interface LayoutProps {
  children: React.ReactNode;
  params: { slug: string };
}

/**
 * Pre-render the top 50 shops at build time.
 * New / less-visited shops fall back to dynamic rendering.
 */
export async function generateStaticParams() {
  try {
    const supabase = createAdminClient();
    const { data: shops } = await supabase
      .from("shops")
      .select("slug")
      .eq("is_approved", true)
      .order("created_at", { ascending: false })
      .limit(50);
    return (shops ?? []).map((s) => ({ slug: s.slug as string }));
  } catch {
    // Don't fail the build if Supabase is unreachable
    return [];
  }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const supabase = createAdminClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("name, address_line1, slug")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!shop) {
    return {
      title: "Shop Not Found | Scan2Paper",
      // Explicitly noindex missing shop pages so Google doesn't index 404-like pages.
      robots: { index: false, follow: true },
    };
  }

  const title = `${shop.name} | Print Online at Scan2Paper`;
  const description = `Order high-quality prints from ${shop.name} at ${shop.address_line1}. Upload your documents online and collect your prints when ready.`;

  // Use absolute canonical URL — more robust than relative path.
  // metadataBase resolves relative URLs, but absolute is unambiguous.
  const canonicalUrl = `${BASE_URL}/s/${shop.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      // Shop pages are transactional landing pages accessed via QR code or
      // direct link — not marketing pages. Keeping them noindex prevents
      // thin-content shop pages from diluting the site's SEO signal while
      // still allowing Googlebot to follow links out of them.
      index: false,
      follow: true,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalUrl,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/**
 * ShopLayout — server component.
 *
 * Fetches shop data a second time to inject JSON-LD structured data into the
 * SSR HTML. This is intentional: generateMetadata already fetches for <head>
 * tags, but structured data must be in <body> HTML — it can't come from metadata.
 *
 * The ShopStructuredData component is a server component (no "use client") so
 * the <script type="application/ld+json"> is present in the initial HTML
 * payload that Googlebot parses — NOT injected by JS after load.
 *
 * The ISR revalidate=300 cache means this second fetch is nearly free in prod.
 */
export default async function ShopLayout({ children, params }: LayoutProps) {
  let shopData: {
    name?: string;
    address_line1?: string;
    phone?: string;
    slug?: string;
    opening_time?: string;
    closing_time?: string;
  } | null = null;

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("shops")
      .select("name, address_line1, owner_phone, slug, business_hours")
      .eq("slug", params.slug)
      .eq("is_approved", true)
      .maybeSingle();
    
    if (data) {
      const bh = data.business_hours as Record<string, any> | null;
      shopData = {
        name: data.name,
        address_line1: data.address_line1,
        phone: data.owner_phone,
        slug: data.slug,
        opening_time: bh?.opening_time || "09:00",
        closing_time: bh?.closing_time || "21:00",
      };
    }
  } catch (err) {
    console.error("[ShopLayout] Failed to query dynamic shop schema:", err);
  }

  return (
    <>
      {shopData && (
        <ShopStructuredData
          shop={{
            name: shopData.name,
            address: shopData.address_line1,
            phone: shopData.phone,
            slug: shopData.slug,
            opening_time: shopData.opening_time,
            closing_time: shopData.closing_time,
          }}
        />
      )}
      {children}

      <nav aria-label="Site links" className="sr-only">
        <Link href="/">Scan2Paper Home</Link>
      </nav>
    </>
  );
}
