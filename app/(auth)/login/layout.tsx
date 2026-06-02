import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Scan2Paper",
  alternates: {
    canonical: "https://scan2paper.com/login",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
