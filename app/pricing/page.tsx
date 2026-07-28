import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing – Print Shop Management Software | Scan2Paper",
  description:
    "Simple, transparent pricing for print shop owners on Scan2Paper. Get the best digital print shop software for free and scale as your business grows.",
  alternates: {
    canonical: "https://scan2paper.com/pricing",
  },
  keywords: [
    "Scan2Paper pricing",
    "print shop software price",
    "xerox shop management free",
    "print shop SaaS India",
  ],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Pricing – Print Shop Management Software | Scan2Paper",
    description:
      "Simple, transparent pricing for print shop owners on Scan2Paper. Get the best digital print shop software for free and scale as your business grows.",
    url: "https://scan2paper.com/pricing",
    type: "website",
    siteName: "Scan2Paper",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing – Print Shop Management Software | Scan2Paper",
    description: "Simple, transparent pricing for Scan2Paper print shop software.",
  },
};

// JSON-LD structured data for the pricing page
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://scan2paper.com/pricing#webpage",
      url: "https://scan2paper.com/pricing",
      name: "Pricing – Print Shop Management Software | Scan2Paper",
      description:
        "Simple, transparent pricing for print shop owners on Scan2Paper.",
      isPartOf: { "@id": "https://scan2paper.com/#website" },
      about: { "@id": "https://scan2paper.com/#organization" },
    },
    {
      "@type": "Product",
      "@id": "https://scan2paper.com/pricing#product",
      name: "Scan2Paper Print Shop Management Software",
      description:
        "Complete print shop management software for xerox shops, copy centres, and print businesses in India.",
      url: "https://scan2paper.com",
      brand: {
        "@type": "Brand",
        name: "Scan2Paper",
      },
      offers: [
        {
          "@type": "Offer",
          name: "Starter Plan",
          price: "0",
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
          description: "Free forever. Unlimited orders, QR code shop page, customer document upload, and basic dashboard.",
          url: "https://scan2paper.com/pricing",
        },
        {
          "@type": "Offer",
          name: "Pro Plan",
          price: "499",
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: "499",
            priceCurrency: "INR",
            unitCode: "MON",
          },
          description: "Everything in Starter plus staff management, advanced analytics, priority support, and custom branding.",
          url: "https://scan2paper.com/pricing",
        },
      ],
    },
  ],
};

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-4 py-16">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-lg text-gray-600 mb-12">
          Start for free. No setup fees. No hidden charges.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          {/* Free Plan */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm text-left">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Starter</h2>
            <p className="text-3xl font-extrabold text-emerald-600 mb-4">
              Free
            </p>
            <ul className="space-y-2 text-sm text-gray-600 mb-6">
              <li>✓ Unlimited orders</li>
              <li>✓ QR code & shop page</li>
              <li>✓ Document upload by customers</li>
              <li>✓ PDF upload by customers</li>
              <li>✓ Basic dashboard</li>
            </ul>
            <Link
              href="/login"
              className="block text-center px-6 py-2.5 border border-emerald-600 text-emerald-700 rounded-xl font-semibold hover:bg-emerald-50 transition"
            >
              Get Started
            </Link>
          </div>

          {/* Pro Plan */}
          <div className="bg-emerald-600 rounded-2xl p-8 text-left text-white shadow-md">
            <h2 className="text-xl font-bold mb-1">Pro</h2>
            <p className="text-3xl font-extrabold mb-1">₹499</p>
            <p className="text-emerald-200 text-sm mb-4">per month</p>
            <ul className="space-y-2 text-sm text-emerald-50 mb-6">
              <li>✓ Everything in Starter</li>
              <li>✓ Staff management</li>
              <li>✓ Advanced analytics</li>
              <li>✓ Priority support</li>
              <li>✓ Custom branding</li>
            </ul>
            <Link
              href="/login"
              className="block text-center px-6 py-2.5 bg-white text-emerald-700 rounded-xl font-semibold hover:bg-emerald-50 transition"
            >
              Start Pro Trial
            </Link>
          </div>
        </div>

        <p className="text-sm text-gray-500">
          Questions?{" "}
          <Link href="/contact" className="text-emerald-600 hover:underline">
            Contact us
          </Link>
        </p>
      </div>
      </main>
    </>
  );
}
