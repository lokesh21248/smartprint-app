import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Features – Scan2Paper",
  description:
    "Explore Scan2Paper's features: real-time order management, UPI payments, PDF upload, QR code shop discovery, staff management, and live analytics for print shop owners.",
  alternates: {
    canonical: "https://scan2paper.com/features",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Features – Scan2Paper",
    description:
      "Everything you need to run a modern print shop: orders, payments, staff, and analytics — in one dashboard.",
    url: "https://scan2paper.com/features",
    type: "website",
  },
};

const features = [
  {
    title: "Real-Time Order Management",
    description:
      "Get instant notifications for new print orders. Accept, process, and mark orders complete from one screen.",
  },
  {
    title: "UPI Payments",
    description:
      "Customers pay via UPI directly on the order page. Funds settle to your account — no middleman.",
  },
  {
    title: "PDF Upload & Print Settings",
    description:
      "Customers upload their documents, choose colour, duplex, and copy count online before arriving.",
  },
  {
    title: "QR Code Shop Discovery",
    description:
      "Each shop gets a unique QR code. Customers scan it to land directly on your shop page and place an order.",
  },
  {
    title: "Staff Management",
    description:
      "Add staff members, assign roles, and let your team handle the counter while you track everything remotely.",
  },
  {
    title: "Live Analytics Dashboard",
    description:
      "See today's revenue, order count, average completion time, and active customers in real time.",
  },
];

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-4 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Everything Your Print Shop Needs
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Scan2Paper replaces manual paperwork with a fully digital workflow —
            from order intake to payment collection to analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                {f.title}
              </h2>
              <p className="text-gray-600 text-sm">{f.description}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/login"
            className="inline-block px-8 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition"
          >
            Get Started Free
          </Link>
          <p className="mt-4 text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="text-emerald-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
