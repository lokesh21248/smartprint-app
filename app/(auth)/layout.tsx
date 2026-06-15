import type { Metadata } from "next";
import { Scan2PaperLogo } from "@/components/shared/Scan2PaperLogo";

// Auth pages should NOT be indexed — they're utility pages for authenticated flows.
// However they CAN be followed (links on them may point to public pages).
export const metadata: Metadata = {
  title: {
    default: "Sign In | Scan2Paper",
    template: "%s | Scan2Paper",
  },
  description:
    "Sign in to your Scan2Paper shop owner panel to manage orders, staff, and analytics.",
  robots: {
    index: false,
    follow: true, // Allow Googlebot to follow outbound links on auth pages
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E8F5EE] via-white to-[#E8F1F8] flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-[#2E8B57]/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-[#1F4E79]/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-[500px]">
        {/* Brand */}
        <div className="flex flex-col items-center justify-center mb-8">
          <Scan2PaperLogo variant="full" size={52} color="color" />
          <p className="text-sm text-[#6B7280] mt-2">Shop Owner Panel</p>
        </div>
        {children}
      </div>
    </div>
  );
}
