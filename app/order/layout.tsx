import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Your Order | SmartPrint",
  description: "Track the status of your print order in real time. Get notified when your documents are ready for pickup.",
  alternates: {
    canonical: "/order",
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

export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
