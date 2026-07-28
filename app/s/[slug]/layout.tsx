import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopStructuredData } from "@/components/seo/ShopStructuredData";

// ISR: revalidate shop layout data every 5 minutes.
// Vercel Edge will serve the cached HTML to ALL customers globally
// without hitting Supabase on every request.
export const revalidate = 300;

const BASE_URL = "https://scan2paper.com";

// ── React cache() deduplication ──────────────────────────────────────────────
// Both generateMetadata and ShopLayout need shop data. Wrapping the fetch in
// React's cache() ensures only ONE Supabase query executes per request,
// regardless of how many times this function is called within the same render.
const getShopForLayout = cache(async (slug: string) => {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("shops")
      .select("name, address_line1, city, state, pincode, owner_phone, slug, business_hours, is_approved")
      .eq("slug", slug)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
});

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
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
  const { slug } = await params;
  const shop = await getShopForLayout(slug);

  if (!shop || !shop.is_approved) {
    return {
      title: "Shop Not Found | Scan2Paper",
      robots: { index: false, follow: true },
    };
  }

  const locationParts = [shop.city, shop.state].filter(Boolean).join(", ");
  const title = `${shop.name} – Print Shop${locationParts ? ` in ${locationParts}` : ""} | Scan2Paper`;
  const description = `Order high-quality prints from ${shop.name}${shop.address_line1 ? ` at ${shop.address_line1}` : ""}${locationParts ? `, ${locationParts}` : ""}. Upload your documents online via Scan2Paper and collect your prints when ready. Black & white and colour printing available.`;
  const canonicalUrl = `${BASE_URL}/s/${shop.slug}`;

  return {
    title,
    description,
    keywords: [
      shop.name,
      "print shop",
      "xerox shop",
      shop.city ?? "",
      "online printing",
      "Scan2Paper",
      "document upload",
      "PDF printing",
    ].filter(Boolean),
    alternates: {
      canonical: canonicalUrl,
    },
    // ── Shop pages ARE public marketing pages (local business profiles). ──
    // They should be indexed so customers can discover print shops via Google.
    // Only unapproved or not-found shops remain noindex (handled above).
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalUrl,
      siteName: "Scan2Paper",
      images: [
        {
          url: `${BASE_URL}/logo.png`,
          width: 512,
          height: 512,
          alt: `${shop.name} – Scan2Paper Print Shop`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/logo.png`],
    },
  };
}

/**
 * ShopLayout — server component.
 *
 * Uses React cache() to share the Supabase fetch with generateMetadata —
 * one DB call per request, not two.
 *
 * The ShopStructuredData component is a server component (no "use client") so
 * the <script type="application/ld+json"> is present in the initial HTML
 * payload that Googlebot parses — NOT injected by JS after load.
 */
export default async function ShopLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  const data = await getShopForLayout(slug);

  type BusinessHours = {
    opening_time?: string;
    closing_time?: string;
    working_days?: string[];
  };
  const bh = data?.business_hours as BusinessHours | null;

  const shopData = data
    ? {
        name: data.name,
        address: data.address_line1,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        phone: data.owner_phone,
        slug: data.slug,
        opening_time: bh?.opening_time ?? "09:00",
        closing_time: bh?.closing_time ?? "21:00",
        working_days: bh?.working_days ?? [],
      }
    : null;

  return (
    <>
      {shopData && <ShopStructuredData shop={shopData} />}
      {children}

      {/* Server-rendered internal links — crawlable by Googlebot */}
      <nav aria-label="Site links" className="sr-only">
        <Link href="/">Scan2Paper Home</Link>
        <Link href="/find-shop">Find Other Print Shops</Link>
        <Link href="/features">Scan2Paper Features</Link>
      </nav>
    </>
  );
}
