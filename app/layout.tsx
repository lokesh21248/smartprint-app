import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/lib/providers";
import { Analytics } from "@vercel/analytics/react";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-poppins",
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
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
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
      <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
        <body className="font-sans antialiased">
          <Providers>{children}</Providers>
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
