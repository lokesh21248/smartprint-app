import type { Metadata } from "next";
import Link from "next/link";
import { PublicNavbar } from "@/components/shared/PublicNavbar";
import { PublicFooter } from "@/components/shared/PublicFooter";
import { ShieldCheck, Target, Heart, Store, ArrowRight } from "lucide-react";

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
      description: "Scan2Paper is a digital platform purpose-built for print shop owners across India.",
      isPartOf: { "@id": "https://scan2paper.com/#website" },
      about: { "@id": "https://scan2paper.com/#organization" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://scan2paper.com/" },
        { "@type": "ListItem", position: 2, name: "About", item: "https://scan2paper.com/about" },
      ],
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
        availableLanguage: ["English", "Hindi", "Telugu"],
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

      <PublicNavbar />

      <main className="min-h-screen bg-slate-50 text-slate-800 antialiased pb-20">
        <section className="pt-14 pb-16 px-4 sm:px-6 bg-gradient-to-b from-emerald-50/70 via-white to-slate-50 text-center">
          <div className="max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-700 bg-emerald-100/70 px-3.5 py-1.5 rounded-full border border-emerald-200">
              Our Story &amp; Mission
            </span>
            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              About Scan2Paper
            </h1>
            <p className="text-slate-600 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              Empowering local xerox shops and copy centres across India with enterprise-grade cloud printing technology.
            </p>
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 -mt-4 space-y-8">
          <div className="bg-white rounded-3xl p-8 sm:p-10 border border-slate-100 shadow-sm space-y-6 text-slate-600 leading-relaxed text-base">
            <p>
              <strong>Scan2Paper</strong> was born from a simple observation: millions of students, professionals, and citizens in India stand in long queues at xerox shops every single day. Counter operators struggle to manage multiple pen drives, virus-infected USBs, endless WhatsApp files, and cash calculations simultaneously.
            </p>
            <p>
              We built Scan2Paper to digitalise the entire print journey. With our platform, customers simply scan a counter QR code or enter a 6-letter shop code to upload their PDF documents, configure print settings, and pay. The shop owner receives an instant notification, prints the job, and has it ready before the customer reaches the counter.
            </p>
            <p>
              Our mission is to make every neighbourhood xerox shop in India as convenient and fast as ordering food online. We believe local small business owners deserve powerful software without expensive upfront hardware or complicated setups.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm text-center space-y-2">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">Zero Queues</h3>
              <p className="text-xs text-slate-500">Eliminating crowded counters and wait times.</p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm text-center space-y-2">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">Privacy First</h3>
              <p className="text-xs text-slate-500">2-hour automatic file deletion guarantee.</p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm text-center space-y-2">
              <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Store className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">Local Growth</h3>
              <p className="text-xs text-slate-500">Helping neighbourhood xerox shops scale.</p>
            </div>
          </div>

          <div className="text-center pt-4">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-sm hover:bg-emerald-700 transition shadow-sm hover:shadow"
            >
              Get in Touch with Our Team
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}
