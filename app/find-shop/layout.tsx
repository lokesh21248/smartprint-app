import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Find a Shop | Scan2Paper",
  description: "Find your local print shop on Scan2Paper using their 6-letter shop code.",
  alternates: {
    canonical: "/find-shop",
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

export default function FindShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
