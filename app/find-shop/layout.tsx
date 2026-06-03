import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Find a Shop | Scan2Paper",
  description: "Find your local print shop on Scan2Paper using their 6-letter shop code.",
  // noindex: utility/lookup page — not a marketing page.
  // follow: true so Googlebot can still crawl outbound links.
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
