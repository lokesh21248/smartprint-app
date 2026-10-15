import type { Metadata } from "next";
import Link from "next/link";
import { HomeAuthRedirect } from "@/components/shared/HomeAuthRedirect";
import { PublicNavbar } from "@/components/shared/PublicNavbar";
import { PublicFooter } from "@/components/shared/PublicFooter";
import { LatestArticles } from "@/components/shared/LatestArticles";
import { allPosts } from "@/lib/blog/posts";
import { createAdminClient } from "@/lib/supabase/admin";
import { 
  FileText, QrCode, Printer, ShieldCheck, 
  ArrowRight, Sparkles, Smartphone, Clock, 
  CheckCircle2, Store, HelpCircle, LayoutDashboard
} from "lucide-react";

// Static page rendered at build time, revalidated every hour (ISR).
// Authenticated-user → /dashboard redirect happens in middleware at the edge.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Scan2Paper – Smart Online Printing Platform | Xerox Shop Software India",
  description:
    "Scan2Paper is India's leading digital printing platform for xerox shops, copy centres, and document service providers. Accept PDF print orders online, enable QR code ordering, manage staff, and eliminate counter queues. Free to start.",
  alternates: {
    canonical: "https://scan2paper.com/",
  },
  keywords: [
    "Scan2Paper",
    "Scan Paper",
    "online print shop India",
    "xerox shop software",
    "print shop management platform",
    "PDF upload printing online",
    "QR code print ordering",
    "xerox shop billing app",
    "online document printing near me",
    "print shop automation software",
    "college project printing service",
  ],
  openGraph: {
    title: "Scan2Paper – Smart Online Printing Platform",
    description:
      "India's online printing platform for xerox shops. Accept orders online, upload PDF documents, and manage print workflows effortlessly. Free forever starter plan.",
    url: "https://scan2paper.com/",
    type: "website",
    siteName: "Scan2Paper",
    images: [
      {
        url: "https://scan2paper.com/logo.png",
        width: 512,
        height: 512,
        alt: "Scan2Paper — Digital Print Shop Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Scan2Paper – Smart Online Printing Platform",
    description: "Accept print orders online, enable QR document upload, and eliminate counter queues for xerox shops in India.",
    images: ["https://scan2paper.com/logo.png"],
  },
};

const faqs = [
  {
    q: "How does online printing with Scan2Paper work?",
    a: "Customers scan the unique QR code outside or inside the xerox shop, or enter the 6-letter shop code. They upload their PDF or document from their phone or laptop, configure colour, copies, and binding, and submit the order. The print shop owner gets an instant alert on their dashboard, prints the file, and marks it ready for quick counter pickup.",
  },
  {
    q: "Do customers need to download an app to order prints?",
    a: "No app download is needed. Scan2Paper runs entirely in any modern mobile or desktop web browser (Chrome, Safari, Edge). Customers can scan a QR code with their standard camera and upload documents immediately in seconds.",
  },
  {
    q: "How does Scan2Paper ensure document security and customer privacy?",
    a: "All file transmissions are encrypted using SSL/TLS. Printed files are automatically and permanently purged from cloud storage after 2 hours. Shop owners and staff can only access the files to perform the print job.",
  },
  {
    q: "Is Scan2Paper free for print shop owners in India?",
    a: "Yes! Scan2Paper offers a 100% Free Starter Plan with unlimited orders, a unique shop QR code, customer document upload portal, and basic dashboard. Advanced features like staff accounts and multi-counter analytics are available on our Pro plan.",
  },
  {
    q: "What file formats can customers upload for printing?",
    a: "Scan2Paper supports PDF, Word documents (.doc, .docx), PowerPoint presentations (.ppt, .pptx), text files, and high-resolution images (.jpg, .png).",
  },
  {
    q: "How do customers pay for their print jobs?",
    a: "Scan2Paper gives shop owners total flexibility. You can collect payments your usual way — cash at counter pickup, direct UPI QR code (Google Pay, PhonePe, Paytm), or online.",
  },
];

// Rich JSON-LD structured data graph including WebSite, Organization, SoftwareApplication, and FAQPage
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://scan2paper.com/#website",
      "url": "https://scan2paper.com",
      "name": "Scan2Paper",
      "description": "Smart Online Printing & Xerox Shop Management Platform India",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://scan2paper.com/blog?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": "https://scan2paper.com/#organization",
      "name": "Scan2Paper",
      "alternateName": ["Scan Paper", "Scan To Paper", "Scan2Paper India"],
      "url": "https://scan2paper.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://scan2paper.com/logo.png",
        "contentUrl": "https://scan2paper.com/logo.png",
        "width": 512,
        "height": 512,
      },
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "support@scan2paper.com",
        "contactType": "customer support",
        "areaServed": "IN",
        "availableLanguage": ["English", "Hindi", "Telugu"],
      },
      "sameAs": [],
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://scan2paper.com/#software",
      "name": "Scan2Paper",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "All (Web Browser)",
      "url": "https://scan2paper.com",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "INR",
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "ratingCount": "128",
      },
    },
    {
      "@type": "FAQPage",
      "@id": "https://scan2paper.com/#faq",
      "mainEntity": faqs.map((faq) => ({
        "@type": "Question",
        "name": faq.q,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.a,
        },
      })),
    },
    {
      "@type": "WebPage",
      "@id": "https://scan2paper.com/#webpage",
      "url": "https://scan2paper.com/",
      "name": "Scan2Paper – Smart Online Printing Platform",
      "isPartOf": { "@id": "https://scan2paper.com/#website" },
      "about": { "@id": "https://scan2paper.com/#organization" },
      "description":
        "Scan2Paper helps print shop owners and xerox centres in India accept orders online, upload documents, eliminate queues, and manage their business from one live dashboard.",
    },
  ],
};

async function getShopNetworkCount(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("shops")
      .select("id", { count: "exact", head: true })
      .eq("is_approved", true)
      .eq("is_active", true);
    return count ?? 30;
  } catch {
    return 30;
  }
}

export default async function Home() {
  const shopCount = await getShopNetworkCount();
  const latestPosts = allPosts.slice(0, 3);

  return (
    <>
      {/* JSON-LD structured data for Google rich snippets and knowledge graph */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Edge / Client auth redirect */}
      <HomeAuthRedirect />

      {/* Main Public Navigation */}
      <PublicNavbar />

      <main className="min-h-screen bg-slate-50 text-slate-800 antialiased overflow-hidden">
        {/* HERO SECTION */}
        <section className="relative pt-16 pb-20 md:pt-24 md:pb-28 px-4 sm:px-6 bg-gradient-to-b from-emerald-50/60 via-white to-slate-50">
          <div className="max-w-5xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100/70 border border-emerald-200/80 text-emerald-800 text-xs sm:text-sm font-bold tracking-wide animate-fade-in">
              <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
              <span>India&apos;s #1 Cloud Print Platform for Xerox Shops</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
              Smart Online Printing Platform <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-800 bg-clip-text text-transparent">
                for Modern Xerox Shops
              </span>
            </h1>

            <p className="text-base sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed font-normal">
              Empower your xerox shop with online PDF uploads, QR code counter ordering, and instant order tracking. Customers upload documents from their phones — pick up printed copies without standing in line.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-4">
              <Link
                href="/login"
                className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-extrabold text-base flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/20 hover:shadow-xl transition-all active:scale-95"
              >
                <LayoutDashboard className="w-5 h-5" />
                Sign in to Dashboard
              </Link>
              <Link
                href="/signup"
                className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-200 hover:border-emerald-600 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <Store className="w-5 h-5 text-emerald-600" />
                Register Your Xerox Shop Free
              </Link>
            </div>

            {/* Trust badge row */}
            <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm font-semibold text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Zero App Installation
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                2-Hour Auto-Delete Privacy
              </span>
              <span className="flex items-center gap-1.5">
                <Store className="w-4 h-4 text-emerald-600" />
                {shopCount}+ Active Xerox Shops Across India
              </span>
            </div>
          </div>
        </section>

        {/* 3-STEP WORKFLOW SECTION */}
        <section aria-labelledby="how-it-works-heading" className="py-20 px-4 sm:px-6 bg-white border-y border-slate-100">
          <div className="max-w-5xl mx-auto space-y-12">
            <div className="text-center space-y-3">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                Simple &amp; Fast Process
              </span>
              <h2 id="how-it-works-heading" className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                How Online Printing Works with Scan2Paper
              </h2>
              <p className="text-slate-500 max-w-2xl mx-auto text-sm sm:text-base">
                Whether you are a student rushing for class or a business customer needing immediate copies, printing takes less than 60 seconds.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Step 1 */}
              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 hover:border-emerald-200 transition relative space-y-4">
                <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-md shadow-emerald-600/20">
                  <QrCode className="w-7 h-7" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-600 block">Step 01</span>
                <h3 className="text-xl font-bold text-slate-900">Scan QR or Enter Shop Code</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Scan the shop&apos;s unique QR code using your phone camera or enter their 6-letter code on Scan2Paper to open their direct ordering page.
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 hover:border-emerald-200 transition relative space-y-4">
                <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-md shadow-emerald-600/20">
                  <FileText className="w-7 h-7" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-600 block">Step 02</span>
                <h3 className="text-xl font-bold text-slate-900">Upload PDF &amp; Choose Settings</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Select your documents (PDF, Word, or images). Choose Black &amp; White or Color, copy count, duplex (double-sided), and optional binding.
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 hover:border-emerald-200 transition relative space-y-4">
                <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-md shadow-emerald-600/20">
                  <Printer className="w-7 h-7" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-600 block">Step 03</span>
                <h3 className="text-xl font-bold text-slate-900">Collect Fresh Prints at Counter</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  The print shop receives your order instantly with audio alerts. Your documents are printed and ready when you reach the shop counter.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CORE FEATURES GRID */}
        <section aria-labelledby="features-heading" className="py-20 px-4 sm:px-6 bg-slate-50">
          <div className="max-w-5xl mx-auto space-y-12">
            <div className="text-center space-y-3">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-600 bg-emerald-100/60 px-3 py-1 rounded-full border border-emerald-200/60">
                Built For Print Businesses
              </span>
              <h2 id="features-heading" className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Everything Your Print Shop Needs to Run Smarter
              </h2>
              <p className="text-slate-500 max-w-2xl mx-auto text-sm sm:text-base">
                Say goodbye to crowded queues, USB virus infections, and messy WhatsApp chats. Run a professional digital printing business from one screen.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Zero App Installation</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Customers order right inside mobile web browsers without installing extra apps or setting up accounts.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">2-Hour Auto-Delete Privacy</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Confidential documents, Aadhaar cards, resumes, and study notes are automatically wiped permanently from storage.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Real-Time Sound Alerts</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Instant audible chime when new print orders arrive so your operators never miss an urgent order.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                  <Printer className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Smart Print Pricing</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Set custom rates for B&amp;W and Color per page with automatic volume calculations for single or double-sided prints.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center">
                  <QrCode className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Custom Shop QR Standee</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Every shop gets a print-ready branded QR card to place on your counter, front door, or university campus bulletin.
                </p>
              </div>

              <div className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
                  <Store className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Multi-Counter Staff Access</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Assign staff members with granular permissions so your counter assistants can process prints while you track revenue remotely.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* LATEST ARTICLES FROM BLOG */}
        <LatestArticles posts={latestPosts} />

        {/* FREQUENTLY ASKED QUESTIONS */}
        <section aria-labelledby="faq-heading" className="py-20 px-4 sm:px-6 bg-white border-t border-slate-100">
          <div className="max-w-4xl mx-auto space-y-12">
            <div className="text-center space-y-3">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                Got Questions?
              </span>
              <h2 id="faq-heading" className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Frequently Asked Questions
              </h2>
              <p className="text-slate-500 max-w-xl mx-auto text-sm sm:text-base">
                Everything you need to know about using Scan2Paper as a customer or shop owner.
              </p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="bg-slate-50 rounded-2xl p-6 border border-slate-100 transition hover:border-emerald-200"
                >
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2 flex items-start gap-2.5">
                    <HelpCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{faq.q}</span>
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed pl-7.5">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CALL TO ACTION BANNER */}
        <section aria-labelledby="cta-heading" className="py-20 px-4 sm:px-6 bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 text-white text-center">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 id="cta-heading" className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              Ready to Modernise Your Print Shop?
            </h2>
            <p className="text-emerald-100 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Join xerox shops, cyber cafes, and copy centres across India growing their orders and eliminating counter queues with Scan2Paper.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <Link
                href="/signup"
                className="w-full sm:w-auto px-8 py-4 bg-white text-emerald-800 hover:bg-emerald-50 rounded-2xl font-black text-base shadow-xl transition active:scale-95"
              >
                Get Started Free Forever
              </Link>
              <Link
                href="/features"
                className="w-full sm:w-auto px-8 py-4 border-2 border-emerald-300/80 hover:bg-emerald-700/50 text-white rounded-2xl font-bold text-base transition"
              >
                Explore All Features
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Main Public Footer */}
      <PublicFooter />
    </>
  );
}
