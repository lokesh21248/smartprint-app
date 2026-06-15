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
    <div className="bg-white rounded-[24px] shadow-[0_8px_40px_-8px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] border border-slate-100 p-10 sm:p-12 animate-fade-in w-full max-w-[500px] mx-auto transition-shadow duration-300">
      {/* Header */}
      <div className="mb-9">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-5 shadow-sm">
          {icon}
        </div>
        <h2 className="text-[40px] font-black text-slate-900 tracking-tight leading-tight mb-2">
          {title}
        </h2>
        <p className="text-base text-slate-500 font-medium leading-relaxed">
          {description}
        </p>
      </div>

      {/* Form slot */}
      {children}

      {/* Footer slot */}
      {footer}

      {/* Clerk CAPTCHA */}
      <div id="clerk-captcha" />
    </div>
  );
}

export function AuthLoader() {
  return (
    <div className="flex w-full min-h-[400px] items-center justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin text-[#16A34A]" />
    </div>
  );
}
