import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scan2Paper – Digital Print Shop Management",
  description:
    "Scan2Paper helps print shop owners manage orders, staff, and revenue from one powerful dashboard. Customers upload documents, pay via UPI, and pick up prints — seamlessly.",
  alternates: {
    canonical: "https://scan2paper.com/",
  },
  openGraph: {
    title: "Scan2Paper – Digital Print Shop Management",
    description:
      "Manage your print shop orders, staff, and analytics from one powerful dashboard. Join Scan2Paper today.",
    url: "https://scan2paper.com/",
    type: "website",
  },
};

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-4 py-16 text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        Digital Print Shop Management
      </h1>
      <p className="text-lg text-gray-600 max-w-xl mb-8">
        Scan2Paper helps print shop owners manage orders, staff, and revenue
        from one powerful dashboard. Customers upload documents, pay via UPI,
        and pick up prints — seamlessly.
      </p>
      <div className="flex flex-wrap gap-4 justify-center">
        <Link
          href="/login"
          className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition"
        >
          Sign In to Dashboard
        </Link>
        <Link
          href="/features"
          className="px-6 py-3 border border-emerald-600 text-emerald-700 rounded-xl font-semibold hover:bg-emerald-50 transition"
        >
          See Features
        </Link>
      </div>
      <nav aria-label="Site links" className="mt-10 flex flex-wrap gap-6 justify-center text-sm text-gray-500">
        <Link href="/features" className="hover:text-emerald-700 transition">Features</Link>
        <Link href="/pricing" className="hover:text-emerald-700 transition">Pricing</Link>
        <Link href="/about" className="hover:text-emerald-700 transition">About</Link>
        <Link href="/contact" className="hover:text-emerald-700 transition">Contact</Link>
      </nav>
    </main>
  );
}

