import type { Metadata } from "next";
import { Printer } from "lucide-react";

// Auth pages should NOT be indexed — they're utility pages for authenticated flows.
// However they CAN be followed (links on them may point to public pages).
export const metadata: Metadata = {
  title: {
    default: "Sign In | SmartPrint",
    template: "%s | SmartPrint",
  },
  description:
    "Sign in to your SmartPrint shop owner panel to manage orders, staff, and analytics.",
  robots: {
    index: false,
    follow: true,
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

      <div className="relative w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#2E8B57] flex items-center justify-center shadow-lg">
            <Printer className="h-6 w-6 text-white" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#111827]">SmartPrint</p>
            <p className="text-sm text-[#6B7280]">Shop Owner Panel</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
