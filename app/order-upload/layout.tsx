import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Upload Documents | Scan2Paper",
  description: "Upload your PDF documents, configure print settings, and place your order securely with Scan2Paper.",
  alternates: {
    // Absolute canonical — more robust than relative path.
    canonical: "https://scan2paper.com/order-upload",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function OrderUploadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Server-rendered internal links — crawlable by Googlebot */}
      <nav aria-label="Site links" className="sr-only">
        <Link href="/">Scan2Paper Home</Link>
        <Link href="/find-shop">Find a Print Shop</Link>
      </nav>
    </>
  );
}
