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
    <div className="bg-white rounded-3xl shadow-2xl shadow-slate-900/[0.02] border border-slate-100/80 p-8 sm:p-10 animate-fade-in w-full max-w-md mx-auto transition-all duration-300 hover:shadow-emerald-900/[0.01]">
      <div className="mb-8">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100/50 flex items-center justify-center mb-4">
          {icon}
        </div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">{title}</h2>
        <p className="text-slate-500 text-sm font-semibold leading-relaxed">{description}</p>
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
    <div className="flex w-full min-h-[400px] items-center justify-center p-8 animate-pulse">
      <Loader2 className="h-8 w-8 animate-spin text-[#2E8B57]" />
    </div>
  );
}
