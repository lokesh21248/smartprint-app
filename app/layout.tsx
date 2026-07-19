import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/lib/providers";
import dynamic from "next/dynamic";

// Defer Vercel Analytics — not render-critical, must not block first paint
const Analytics = dynamic(
  () => import("@vercel/analytics/react").then((mod) => mod.Analytics),
  { ssr: false }
);

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  // Pin the weights used by the app; omitting unused weights reduces
  // the font download from ~180 KB to ~100 KB (subset of latin glyphs)
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  // metadataBase resolves relative URLs in metadata across all pages.
  // Do NOT set alternates.canonical here — it would be inherited by all routes
  // as a fallback, causing /find-shop and other pages to output the root
  // canonical even when they declare their own. Each page/layout sets its own.
  metadataBase: new URL("https://scan2paper.com"),
  title: {
    default: "Scan2Paper",
    template: "%s | Scan2Paper",
  },
  description:
    "Manage your print shop orders, staff, and analytics from one powerful dashboard.",
  keywords: ["xerox shop", "print shop", "order management", "Scan2Paper"],
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", sizes: "any" },
      { url: "/icon.png?v=2", type: "image/png", sizes: "32x32" }
    ],
    shortcut: "/favicon.ico?v=2",
    apple: "/apple-touch-icon.png?v=2",
  },
  manifest: "/manifest.json",
  // Default Open Graph — overridden per-page; acts as fallback for social sharing
  openGraph: {
    type: "website",
    siteName: "Scan2Paper",
    title: "Scan2Paper — Digital Print Shop Management",
    description: "Manage your print shop orders, staff, and analytics from one powerful dashboard.",
    images: [
      {
        url: "/logo.webp",
        width: 512,
        height: 512,
        alt: "Scan2Paper logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Scan2Paper — Digital Print Shop Management",
    description: "Manage your print shop orders, staff, and analytics from one powerful dashboard.",
    images: ["/logo.webp"],
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

export const viewport: Viewport = {
  themeColor: [
    // Brand primary green for the mobile browser address bar
    { media: "(prefers-color-scheme: light)", color: "#2E8B57" },
    { media: "(prefers-color-scheme: dark)", color: "#1F6B42" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html lang="en" className={inter.variable}>
        <head>
          {/* Reinforce HTTP Link header preconnects with in-markup hints.
              Some CDNs (Cloudflare) strip or delay Link response headers
              before the browser receives them. Having both ensures early
              connection establishment regardless of CDN behaviour. */}
          <link rel="preconnect" href="https://clerk.scan2paper.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="dns-prefetch" href="https://api.supabase.co" />
          <link rel="dns-prefetch" href="https://api.clerk.dev" />
        </head>
        <body className="font-sans antialiased">
          <Providers>{children}</Providers>
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
