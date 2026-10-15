import type { Metadata } from "next";
import Link from "next/link";
import { PublicNavbar } from "@/components/shared/PublicNavbar";
import { PublicFooter } from "@/components/shared/PublicFooter";
import { 
  Printer, QrCode, ShieldCheck, Clock, 
  Users, BarChart3, UploadCloud, Smartphone, 
  CheckCircle2, ArrowRight 
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features – Print Shop Management Software | Scan2Paper",
  description:
    "Explore Scan2Paper's features: real-time order management, PDF upload, QR code shop discovery, staff management, and live analytics for xerox and print shop owners across India.",
  alternates: {
    canonical: "https://scan2paper.com/features",
  },
  keywords: [
    "Scan2Paper features",
    "print shop management software",
    "xerox shop billing features",
    "PDF upload printing tool",
    "QR code print ordering India",
    "xerox shop automation",
  ],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Features – Print Shop Management Software | Scan2Paper",
    description:
      "Everything you need to run a modern print shop: online document uploads, instant audio alerts, staff accounts, and live analytics.",
    url: "https://scan2paper.com/features",
    type: "website",
  },
};

// JSON-LD structured data for the features page with WebPage and BreadcrumbList
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://scan2paper.com/features#webpage",
      "url": "https://scan2paper.com/features",
      "name": "Features – Print Shop Management Software | Scan2Paper",
      "description":
        "Explore Scan2Paper's features: real-time order management, PDF upload, QR code shop discovery, staff management, and live analytics for print shop owners.",
      "isPartOf": { "@id": "https://scan2paper.com/#website" },
      "about": { "@id": "https://scan2paper.com/#organization" },
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://scan2paper.com/" },
        { "@type": "ListItem", "position": 2, "name": "Features", "item": "https://scan2paper.com/features" },
      ],
    },
  ],
};

const featureList = [
  {
    icon: UploadCloud,
    title: "Instant PDF & Document Upload",
    description:
      "Customers upload PDF files, Word docs, resumes, and images directly from their smartphone or laptop before arriving at your shop counter.",
  },
  {
    icon: QrCode,
    title: "Unique Shop QR Code",
    description:
      "Display your branded QR code standee at your counter. Customers scan it with their camera to open your shop page without installing any app.",
  },
  {
    icon: Clock,
    title: "Real-Time Audio Alerts",
    description:
      "Never miss an urgent job. Hear instant chime notifications the moment a customer submits a print order to your live dashboard.",
  },
  {
    icon: Printer,
    title: "Smart Print Configurator",
    description:
      "Customers configure Black & White or Color, copy count, single or double-sided (duplex), and binding options with automatic price previews.",
  },
  {
    icon: ShieldCheck,
    title: "2-Hour File Auto-Delete",
    description:
      "Customer files, identity cards, and confidential documents are automatically wiped from cloud storage after 2 hours for maximum privacy.",
  },
  {
    icon: Users,
    title: "Multi-Staff Counter Roles",
    description:
      "Add counter operators and shop managers with granular permissions so your staff can process prints while you monitor revenue from anywhere.",
  },
  {
    icon: BarChart3,
    title: "Live Analytics & Reports",
    description:
      "Track today's revenue, order counts, average turnaround time, and peak rush hours with real-time graphs and historical insights.",
  },
  {
    icon: Smartphone,
    title: "Browser-Based Convenience",
    description:
      "Works seamlessly across Android, iPhone, iPad, Windows, and Mac. No app store downloads or complicated setup needed.",
  },
  {
    icon: CheckCircle2,
    title: "Flexible Counter Payments",
    description:
      "Collect cash at counter pickup, direct UPI QR code (Google Pay, PhonePe, Paytm), or online payment without gateway commissions.",
  },
];

export default function FeaturesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PublicNavbar />

      <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
        {/* Hero */}
        <section className="pt-14 pb-16 px-4 sm:px-6 bg-gradient-to-b from-emerald-50/70 via-white to-slate-50 text-center">
          <div className="max-w-4xl mx-auto space-y-4">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-700 bg-emerald-100/70 px-3.5 py-1.5 rounded-full border border-emerald-200">
              Powerful Print Shop Tools
            </span>
            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              Everything Your Print Shop Needs to Grow
            </h1>
            <p className="text-slate-600 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Scan2Paper replaces messy pen drives and chaotic WhatsApp queues with a modern, high-speed digital printing workflow.
            </p>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 px-4 sm:px-6 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featureList.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className="bg-white rounded-3xl p-7 border border-slate-100 shadow-sm hover:border-emerald-200 hover:shadow-md transition duration-200 space-y-3.5"
                >
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    {f.title}
                  </h2>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {f.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* CTA Box */}
          <div className="mt-16 bg-gradient-to-br from-emerald-600 to-teal-800 rounded-3xl p-8 sm:p-12 text-white text-center space-y-6 shadow-xl">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              Ready to Upgrade Your Print Shop?
            </h2>
            <p className="text-emerald-100 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              Start accepting online document print orders today. Set up in less than 5 minutes with our free starter plan.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/signup"
                className="px-8 py-3.5 bg-white text-emerald-800 rounded-2xl font-black text-sm hover:bg-emerald-50 shadow-md transition active:scale-95"
              >
                Register Your Shop Free
              </Link>
              <Link
                href="/find-shop"
                className="px-6 py-3.5 border border-emerald-300 text-white rounded-2xl font-bold text-sm hover:bg-emerald-700/40 transition flex items-center gap-1.5"
              >
                Find a Print Shop
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}
