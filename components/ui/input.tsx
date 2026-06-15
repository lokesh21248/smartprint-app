"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, hint, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[14px] font-medium text-slate-700"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            type={type}
            className={cn(
              // Size & shape
              "flex h-12 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3.5 py-2",
              // Typography
              "text-[15px] text-slate-900 placeholder:text-slate-400",
              // Shadow & transition
              "shadow-sm transition-all duration-200",
              // Focus ring — matches brand green
              "focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A]",
              // Disabled
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50",
              // Icon padding
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              // Error state
              error && "border-red-400 focus:ring-red-400/30 focus:border-red-400",
              className
            )}
            ref={ref}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}
        {hint && !error && <p className="text-[13px] text-slate-500">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
