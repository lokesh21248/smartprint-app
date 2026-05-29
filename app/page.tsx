import { redirect } from "next/navigation";
import type { Metadata } from "next";

// Force dynamic so Next.js doesn't try to statically pre-render this redirect
export const dynamic = "force-dynamic";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://scan2paper.com";

export const metadata: Metadata = {
  title: "SmartPrint - Online Printing Service",
  description: "Upload documents and order printouts online with SmartPrint. Fast, secure, and convenient printing for all your files.",
  keywords: ["online printing", "xerox shop", "document printout", "PDF printing", "SmartPrint", "scan2paper"],
  alternates: {
    canonical: "https://scan2paper.com",
  },
  openGraph: {
    title: "SmartPrint - Online Printing Service",
    description: "Upload documents and order printouts online with SmartPrint. Fast, secure, and convenient printing for all your files.",
    url: "https://scan2paper.com",
    type: "website",
    siteName: "SmartPrint",
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartPrint - Online Printing Service",
    description: "Upload documents and order printouts online with SmartPrint. Fast, secure, and convenient printing for all your files.",
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

export default function Home() {
  redirect("/dashboard");
}
