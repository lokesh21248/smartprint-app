import type { Metadata } from "next";
import Link from "next/link";
import { PublicNavbar } from "@/components/shared/PublicNavbar";
import { PublicFooter } from "@/components/shared/PublicFooter";
import { Mail, MessageSquare, Store, ShieldCheck, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us – Scan2Paper Support & Onboarding",
  description:
    "Get in touch with the Scan2Paper team. We're here to help print shop owners get set up, troubleshoot issues, or answer any customer printing questions.",
  alternates: {
    canonical: "https://scan2paper.com/contact",
  },
  keywords: [
    "Scan2Paper contact",
    "print shop support",
    "Scan2Paper customer service",
    "print shop onboarding India",
  ],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Contact Us – Scan2Paper Support & Onboarding",
    description:
      "Get in touch with the Scan2Paper team. We're here to help xerox shop owners and customers succeed.",
    url: "https://scan2paper.com/contact",
    type: "website",
  },
};

// JSON-LD ContactPage structured data with BreadcrumbList
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "ContactPage",
      "@id": "https://scan2paper.com/contact#webpage",
      url: "https://scan2paper.com/contact",
      name: "Contact Us – Scan2Paper",
      description: "Get in touch with the Scan2Paper team for support, onboarding, or questions about managing your print shop.",
      isPartOf: { "@id": "https://scan2paper.com/#website" },
      about: { "@id": "https://scan2paper.com/#organization" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://scan2paper.com/" },
        { "@type": "ListItem", position: 2, name: "Contact", item: "https://scan2paper.com/contact" },
      ],
    },
    {
      "@type": "Organization",
      name: "Scan2Paper",
      contactPoint: {
        "@type": "ContactPoint",
        email: "support@scan2paper.com",
        contactType: "customer support",
        availableLanguage: ["English", "Hindi", "Telugu"],
      },
    },
  ],
};

export default function ContactPage() {
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
              We&apos;re Here to Help
            </span>
            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              Get in Touch with Us
            </h1>
            <p className="text-slate-600 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              Have a question about Scan2Paper, want to register your print shop, or need technical assistance?
            </p>
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 -mt-4">
          <div className="bg-white rounded-3xl p-8 sm:p-10 border border-slate-100 shadow-sm space-y-8">
            <div className="flex items-start gap-4 p-5 rounded-2xl bg-emerald-50/60 border border-emerald-100">
              <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shrink-0">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Official Support Email
                </h2>
                <a
                  href="mailto:support@scan2paper.com"
                  className="text-emerald-700 hover:text-emerald-800 font-extrabold text-xl transition"
                >
                  support@scan2paper.com
                </a>
                <p className="text-slate-500 text-xs mt-1">Typical response within 2–4 business hours</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div className="p-6 rounded-2xl border border-slate-100 bg-slate-50 space-y-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">For Print Shop Owners</h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Ready to onboard your xerox shop or copy centre? Register for free online or reach out directly to receive your printed counter standee kit.
                </p>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 pt-1"
                >
                  Register your shop now <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="p-6 rounded-2xl border border-slate-100 bg-slate-50 space-y-3">
                <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">For Customers</h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Need help tracking an active order or accessing your prints? You can track using the link on your phone or search for your shop.
                </p>
                <Link
                  href="/find-shop"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 pt-1"
                >
                  Find a print shop <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}
