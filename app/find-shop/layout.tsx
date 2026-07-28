import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Find a Print Shop Near You | Scan2Paper",
  description:
    "Find your nearest Scan2Paper print shop using a 6-letter shop code or QR code. Browse our network of partner xerox shops and print shops across India.",
  alternates: {
    canonical: "https://scan2paper.com/find-shop",
  },
  keywords: [
    "find print shop",
    "find xerox shop near me",
    "Scan2Paper shop locator",
    "print shop India",
    "shop code",
  ],
  // /find-shop is a public discovery page — it should be indexed.
  // It helps customers find print shops, which supports brand and shop SEO.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    title: "Find a Print Shop Near You | Scan2Paper",
    description:
      "Enter your shop's 6-letter code or scan the QR code to find and access your nearest Scan2Paper print shop.",
    url: "https://scan2paper.com/find-shop",
    type: "website",
    siteName: "Scan2Paper",
    images: [
      {
        url: "https://scan2paper.com/logo.png",
        width: 512,
        height: 512,
        alt: "Scan2Paper – Find a Print Shop",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Find a Print Shop Near You | Scan2Paper",
    description:
      "Enter your shop's 6-letter code to find and access your nearest Scan2Paper print shop.",
    images: ["https://scan2paper.com/logo.png"],
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
      {/* Server-rendered internal links — crawlable by Googlebot */}
      <nav aria-label="Site links" className="sr-only">
        <Link href="/">Scan2Paper Home</Link>
        <Link href="/features">Features</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/blog">Blog</Link>
      </nav>
    </>
  );
}
