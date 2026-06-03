import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | Scan2Paper",
  robots: {
    index: false,
    follow: true,
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
