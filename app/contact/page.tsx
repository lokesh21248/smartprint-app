import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact – Scan2Paper",
  description:
    "Get in touch with the Scan2Paper team. We're here to help print shop owners get set up, troubleshoot issues, or answer any questions.",
  alternates: {
    canonical: "https://scan2paper.com/contact",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Contact – Scan2Paper",
    description:
      "Get in touch with the Scan2Paper team. We're here to help print shop owners succeed.",
    url: "https://scan2paper.com/contact",
    type: "website",
  },
};

// JSON-LD ContactPage structured data — enables rich results for contact info
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  "@id": "https://scan2paper.com/contact#webpage",
  "url": "https://scan2paper.com/contact",
  "name": "Contact – Scan2Paper",
  "description":
    "Get in touch with the Scan2Paper team for support, onboarding, or any questions about managing your print shop.",
  "isPartOf": { "@id": "https://scan2paper.com/#website" },
  "about": { "@id": "https://scan2paper.com/#organization" },
  "mainEntity": {
    "@type": "Organization",
    "name": "Scan2Paper",
    "contactPoint": {
      "@type": "ContactPoint",
      "email": "support@scan2paper.com",
      "contactType": "customer support",
      "availableLanguage": ["English"],
    },
  },
};

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Contact Us
            </h1>
            <p className="text-lg text-gray-600">
              Have a question or need help getting started? We&apos;re here.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Email
              </h2>
              <a
                href="mailto:support@scan2paper.com"
                className="text-emerald-600 hover:underline text-lg"
                aria-label="Email Scan2Paper support at support@scan2paper.com"
              >
                support@scan2paper.com
              </a>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">
                For Shop Owners
              </h2>
              <p className="text-gray-700 text-sm">
                If you&apos;re a print shop owner looking to onboard your shop,{" "}
                <Link href="/login" className="text-emerald-600 hover:underline">
                  sign in
                </Link>{" "}
                or{" "}
                <a
                  href="mailto:support@scan2paper.com"
                  className="text-emerald-600 hover:underline"
                  aria-label="Email support to get your print shop set up"
                >
                  email us
                </a>{" "}
                and we&apos;ll set you up.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">
                For Customers
              </h2>
              <p className="text-gray-700 text-sm">
                If you need help tracking an order, use the order tracking link
                sent to your phone or email us at{" "}
                <a
                  href="mailto:support@scan2paper.com"
                  className="text-emerald-600 hover:underline"
                  aria-label="Email support for order tracking help"
                >
                  support@scan2paper.com
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
