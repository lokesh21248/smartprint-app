import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Scan2Paper – Print Shop Management Software",
  description:
    "Learn about Scan2Paper — the smart print shop management software platform built for modern xerox and print shops across India.",
  alternates: {
    canonical: "https://scan2paper.com/about",
  },
  keywords: [
    "about Scan2Paper",
    "Scan2Paper company",
    "print shop software India",
    "xerox shop management platform",
  ],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "About Scan2Paper – Print Shop Management Software",
    description:
      "Scan2Paper is a print shop management software platform built for modern xerox and print shops across India.",
    url: "https://scan2paper.com/about",
    type: "website",
    siteName: "Scan2Paper",
  },
  twitter: {
    card: "summary_large_image",
    title: "About Scan2Paper – Print Shop Management Software",
    description: "Learn how Scan2Paper helps xerox shops modernise their operations across India.",
  },
};

// JSON-LD structured data for the About page
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "AboutPage",
      "@id": "https://scan2paper.com/about#webpage",
      url: "https://scan2paper.com/about",
      name: "About Scan2Paper – Print Shop Management Software",
      description:
        "Scan2Paper is a digital platform purpose-built for print shop owners across India.",
      isPartOf: { "@id": "https://scan2paper.com/#website" },
      about: { "@id": "https://scan2paper.com/#organization" },
    },
    {
      "@type": "Organization",
      "@id": "https://scan2paper.com/#organization",
      name: "Scan2Paper",
      alternateName: ["Scan Paper", "Scan To Paper"],
      url: "https://scan2paper.com",
      logo: {
        "@type": "ImageObject",
        url: "https://scan2paper.com/logo.png",
        contentUrl: "https://scan2paper.com/logo.png",
        width: 512,
        height: 512,
      },
      description:
        "Scan2Paper is a digital print shop management platform for xerox shops, copy centres, and document service businesses in India.",
      contactPoint: {
        "@type": "ContactPoint",
        email: "support@scan2paper.com",
        contactType: "customer support",
        availableLanguage: ["English"],
      },
      areaServed: {
        "@type": "Country",
        name: "India",
      },
      foundingDate: "2024",
    },
  ],
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-4 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-6 text-center">
          About Scan2Paper
        </h1>

        <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-6 text-gray-700">
          <p>
            <strong>Scan2Paper</strong> is a digital platform purpose-built for
            print shop owners across India. We help xerox shops, copy centres,
            and printing businesses modernise their operations — replacing manual
            queues and cash-only counters with a seamless digital workflow.
          </p>
          <p>
            With Scan2Paper, customers can upload their documents online, choose
            their print settings, and receive real-time status updates — all
            before they walk into the shop. Shop owners get instant order
            notifications, a live dashboard, and the ability to manage staff
            from anywhere.
          </p>
          <p>
            Our mission is to make every print shop in India as easy to use as
            ordering food online. We believe small business owners deserve
            enterprise-grade tools without the enterprise price tag.
          </p>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/contact"
            className="inline-block px-8 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition"
          >
            Get in Touch
          </Link>
        </div>
      </div>
      </main>
    </>
  );
}
