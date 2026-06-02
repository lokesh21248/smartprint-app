import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Find a Shop | Scan2Paper",
  description: "Find your local print shop on Scan2Paper using their 6-letter shop code.",
  alternates: {
    // Each page must declare its own URL as canonical.
    // /find-shop is a distinct, indexable page — its canonical is its own URL.
    canonical: "https://scan2paper.com/find-shop",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function FindShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      {/* Server-rendered internal link — crawlable by Googlebot */}
      <nav aria-label="Site links" className="sr-only">
        <Link href="/">Scan2Paper Home</Link>
        <Link href="/order-upload">Upload Documents for Printing</Link>
      </nav>
    </>
  );
}
