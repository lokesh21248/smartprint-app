import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About – Scan2Paper",
  description:
    "Learn about Scan2Paper — the print shop management platform built for modern xerox and print shops across India.",
  alternates: {
    canonical: "https://scan2paper.com/about",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "About – Scan2Paper",
    description:
      "Scan2Paper is a print shop management platform built for modern xerox and print shops across India.",
    url: "https://scan2paper.com/about",
    type: "website",
  },
};

export default function AboutPage() {
  return (
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
  );
}
