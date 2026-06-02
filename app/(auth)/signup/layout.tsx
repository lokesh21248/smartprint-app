import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | Scan2Paper",
  alternates: {
    canonical: "https://scan2paper.com/signup",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
