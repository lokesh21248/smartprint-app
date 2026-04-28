import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upload Documents | SmartPrint",
  description: "Upload your PDF documents, configure print settings, and place your order securely with SmartPrint.",
};

export default function OrderUploadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
