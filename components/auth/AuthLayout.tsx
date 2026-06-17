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
    <div className="bg-white rounded-[20px] shadow-[0_4px_24px_-4px_rgba(0,0,0,0.10),0_1px_6px_-1px_rgba(0,0,0,0.05)] border border-slate-100 p-7 animate-fade-in w-full max-w-[440px] mx-auto transition-shadow duration-300">
      {/* Header */}
      <div className="mb-6">
        <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4 shadow-sm">
          {icon}
        </div>
        <h2 className="text-[32px] font-bold text-slate-900 tracking-tight leading-tight mb-1.5">
          {title}
        </h2>
        <p className="text-[15px] text-slate-500 font-medium leading-relaxed">
          {description}
        </p>
      </div>

      {/* Form slot */}
      {children}

      {/* Footer slot */}
      {footer}
    </div>
  );
}

export function AuthLoader() {
  return (
    <div className="flex w-full min-h-[360px] items-center justify-center p-8">
      <Loader2 className="h-7 w-7 animate-spin text-[#16A34A]" />
    </div>
  );
}
