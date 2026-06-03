import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Your Order | Scan2Paper",
  description: "Track the status of your print order in real time. Get notified when your documents are ready for pickup.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
