import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Scan2Paper",
  // Canonical prevents /login?redirect_url=... variants from being indexed
  // as separate pages in Google Search Console.
  alternates: {
    canonical: "https://scan2paper.com/login",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
