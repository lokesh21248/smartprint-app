import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://scan2paper.com";

export const metadata: Metadata = {
  title: "Scan2Paper - Online Printing Service",
  description:
    "Upload documents and order printouts online with Scan2Paper. Fast, secure, and convenient printing for all your files.",
  keywords: [
    "online printing",
    "xerox shop",
    "document printout",
    "PDF printing",
    "Scan2Paper",
  ],
  alternates: {
    canonical: appUrl,
  },
  openGraph: {
    title: "Scan2Paper - Online Printing Service",
    description:
      "Upload documents and order printouts online with Scan2Paper. Fast, secure, and convenient printing for all your files.",
    url: appUrl,
    type: "website",
    siteName: "Scan2Paper",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scan2Paper - Online Printing Service",
    description:
      "Upload documents and order printouts online with Scan2Paper. Fast, secure, and convenient printing for all your files.",
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

export default async function Home() {
  const { userId } = await auth();
  // Authenticated shop owners go to the dashboard.
  // Unauthenticated visitors (customers & potential owners) go to the
  // public find-shop page which IS indexed by search engines.
  if (userId) {
    redirect("/dashboard");
  } else {
    redirect("/find-shop");
  }
}
