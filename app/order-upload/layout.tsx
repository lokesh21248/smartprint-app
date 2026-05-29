import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upload Documents | SmartPrint",
  description: "Upload your PDF documents, configure print settings, and place your order securely with SmartPrint.",
  alternates: {
    canonical: "/order-upload",
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

export default function OrderUploadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
