import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Find a Shop | SmartPrint",
  description: "Find your local print shop on SmartPrint using their 6-letter shop code.",
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
