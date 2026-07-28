/**
 * /find-shop — Server Component.
 *
 * This page is intentionally split into two layers:
 *
 *   1. This file (Server Component) — renders the static H1, description, and
 *      structured data that Googlebot indexes from the initial HTML payload.
 *      Previously this was a client-only page, which meant Googlebot saw only
 *      an empty shell on first load.
 *
 *   2. <FindShopForm> (Client Component) — handles the interactive shop-code
 *      search, lazy-fetches the shop list on first interaction, and navigates
 *      to the shop page.
 *
 * This pattern follows Next.js 15 App Router best practices:
 * keep as much as possible server-rendered; push interactivity to leaf components.
 */

import Link from "next/link";
import { Scan2PaperLogo } from "@/components/shared/Scan2PaperLogo";
import { FindShopForm } from "@/components/shared/FindShopForm";
import { createAdminClient } from "@/lib/supabase/admin";

// JSON-LD structured data for the find-shop page
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://scan2paper.com/find-shop#webpage",
  url: "https://scan2paper.com/find-shop",
  name: "Find a Print Shop Near You | Scan2Paper",
  description:
    "Find your nearest Scan2Paper print shop using a 6-letter shop code or QR code. Browse our network of partner xerox shops across India.",
  isPartOf: { "@id": "https://scan2paper.com/#website" },
  about: { "@id": "https://scan2paper.com/#organization" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://scan2paper.com/" },
      { "@type": "ListItem", position: 2, name: "Find a Shop", item: "https://scan2paper.com/find-shop" },
    ],
  },
};

// Revalidate every 10 minutes — shop list changes infrequently
export const revalidate = 600;

/**
 * Fetch the count of active shops for the SSR statistics line.
 * Falls back gracefully if Supabase is unreachable.
 */
async function getActiveShopCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("shops")
      .select("id", { count: "exact", head: true })
      .eq("is_approved", true)
      .eq("is_active", true);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function FindShopPage() {
  const shopCount = await getActiveShopCount();

  return (
    <>
      {/* JSON-LD structured data — in SSR HTML, visible to Googlebot */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50 p-4 py-12">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          {/* SSR hero — indexed by Googlebot */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <Scan2PaperLogo variant="full" size={48} color="color" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Find a Print Shop</h1>
            <p className="text-gray-600">
              Enter the 6-letter shop code your print shop gave you, or browse
              our network of Scan2Paper partner shops below.
            </p>
            {shopCount > 0 && (
              <p className="text-xs text-emerald-600 font-semibold mt-2">
                {shopCount} active print shops on Scan2Paper
              </p>
            )}
          </div>

          {/* Interactive form — client component */}
          <FindShopForm />
        </div>

        {/* SSR site navigation — helps internal linking and crawlability */}
        <nav
          aria-label="Site navigation"
          className="mt-8 flex flex-wrap gap-4 justify-center text-sm text-gray-500"
        >
          <Link href="/" className="hover:text-emerald-700 transition">
            Home
          </Link>
          <Link href="/features" className="hover:text-emerald-700 transition">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-emerald-700 transition">
            Pricing
          </Link>
          <Link href="/blog" className="hover:text-emerald-700 transition">
            Blog
          </Link>
          <Link href="/contact" className="hover:text-emerald-700 transition">
            Contact
          </Link>
        </nav>
      </main>
    </>
  );
}
