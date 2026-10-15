import type { Metadata } from "next";
import Link from "next/link";
import { PublicNavbar } from "@/components/shared/PublicNavbar";
import { PublicFooter } from "@/components/shared/PublicFooter";
import { Check, ArrowRight, HelpCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing – Print Shop Management Software | Scan2Paper",
  description:
    "Simple, transparent pricing for print shop owners on Scan2Paper. Start with our 100% free starter plan with unlimited orders and upgrade as your business scales.",
  alternates: {
    canonical: "https://scan2paper.com/pricing",
  },
  keywords: [
    "Scan2Paper pricing",
    "print shop software price India",
    "free xerox shop management tool",
    "print shop SaaS cost",
    "affordable printing software",
  ],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Pricing – Print Shop Management Software | Scan2Paper",
    description:
      "Simple, transparent pricing for print shop owners on Scan2Paper. Free starter plan with unlimited orders.",
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
      description: "Simple, transparent pricing for print shop owners on Scan2Paper.",
      isPartOf: { "@id": "https://scan2paper.com/#website" },
      about: { "@id": "https://scan2paper.com/#organization" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://scan2paper.com/" },
        { "@type": "ListItem", position: 2, name: "Pricing", item: "https://scan2paper.com/pricing" },
      ],
    },
    {
      "@type": "Product",
      "@id": "https://scan2paper.com/pricing#product",
      name: "Scan2Paper Print Shop Software",
      description: "Digital print shop and xerox order management software for Indian print businesses.",
      url: "https://scan2paper.com",
      brand: { "@type": "Brand", name: "Scan2Paper" },
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
          description: "Everything in Starter plus staff accounts, live advanced analytics, priority support, and custom branding.",
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

      <PublicNavbar />

      <main className="min-h-screen bg-slate-50 text-slate-800 antialiased pb-20">
        {/* Header */}
        <section className="pt-14 pb-16 px-4 sm:px-6 bg-gradient-to-b from-emerald-50/70 via-white to-slate-50 text-center">
          <div className="max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-700 bg-emerald-100/70 px-3.5 py-1.5 rounded-full border border-emerald-200">
              Clear &amp; Honest Pricing
            </span>
            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              Start Free, Scale as You Grow
            </h1>
            <p className="text-slate-600 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              No setup fees. No hidden commissions on your prints. Free forever for standard xerox counter operations.
            </p>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 -mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {/* Free Plan */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Starter Plan
                </span>
                <div className="space-y-1">
                  <p className="text-4xl font-black text-slate-900">Free</p>
                  <p className="text-slate-500 text-xs font-semibold">100% Free Forever</p>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed border-t border-slate-100 pt-4">
                  Perfect for local xerox shops, cyber cafes, and copy counters looking to eliminate queues.
                </p>
                <ul className="space-y-3 text-sm text-slate-700 pt-2">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Unlimited customer print orders</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Unique branded QR code &amp; shop URL</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>PDF, Word, and image document upload</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Real-time audio alert notifications</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>2-Hour automated file privacy deletion</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/signup"
                className="w-full py-3.5 text-center bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-sm transition shadow-sm"
              >
                Get Started Free
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 rounded-3xl p-8 text-white shadow-xl flex flex-col justify-between space-y-6 relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white">
                Most Popular
              </div>

              <div className="space-y-4">
                <span className="text-xs font-black uppercase tracking-widest text-emerald-200">
                  Pro Business
                </span>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black">₹499</span>
                    <span className="text-emerald-100 text-sm">/ month</span>
                  </div>
                  <p className="text-emerald-200 text-xs font-medium">Billed monthly · Cancel anytime</p>
                </div>
                <p className="text-emerald-50 text-sm leading-relaxed border-t border-emerald-500/40 pt-4">
                  For busy xerox shops and printing agencies requiring multi-staff access and deep analytics.
                </p>
                <ul className="space-y-3 text-sm text-emerald-50 pt-2">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                    <span><strong>Everything in Starter plan</strong></span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                    <span>Multiple counter staff operator logins</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                    <span>Advanced analytics (peak hours &amp; revenue trends)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                    <span>Priority WhatsApp and phone support</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-300 shrink-0" />
                    <span>High-resolution printable shop QR standee kit</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/signup"
                className="w-full py-3.5 text-center bg-white hover:bg-emerald-50 text-emerald-900 rounded-2xl font-black text-sm transition shadow-lg"
              >
                Start Free Pro Trial
              </Link>
            </div>
          </div>

          {/* Pricing FAQ notice */}
          <div className="mt-14 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4">
            <HelpCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <h3 className="font-bold text-slate-900">Have questions regarding pricing?</h3>
              <p className="text-slate-500">
                You can start completely free. No credit card required. If you manage multiple print branches or require custom university integrations,{" "}
                <Link href="/contact" className="text-emerald-600 font-bold hover:underline">
                  contact our team
                </Link>.
              </p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}
