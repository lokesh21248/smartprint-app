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

export default function ContactPage() {
  return (
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
              >
                support@scan2paper.com
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
