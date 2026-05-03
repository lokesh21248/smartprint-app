"use client";

import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface AuthLayoutProps {
  icon: ReactNode;
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}

export function AuthLayout({ icon, title, description, footer, children }: AuthLayoutProps) {
  return (
    <div className="bg-white rounded-3xl shadow-lg border border-[#E5E7EB] p-8 animate-slide-in-up w-full max-w-md mx-auto">
      <div className="mb-8">
        <div className="w-12 h-12 rounded-2xl bg-[#E8F5EE] flex items-center justify-center mb-4">
          {icon}
        </div>
        <h2 className="text-2xl font-bold text-[#111827] mb-2">{title}</h2>
        <p className="text-[#6B7280]">{description}</p>
      </div>
      {children}
      {footer}
      {/* Container for Clerk CAPTCHA bot protection */}
      <div id="clerk-captcha"></div>
    </div>
  );
}

export function AuthLoader() {
  return (
    <div className="flex w-full min-h-[400px] items-center justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin text-[#2E8B57]" />
    </div>
  );
}
