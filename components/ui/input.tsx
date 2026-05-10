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
            className="block text-sm font-medium text-[#374151]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            type={type}
            className={cn(
              "flex h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-base text-[#111827] shadow-sm transition-colors",
              "placeholder:text-[#9CA3AF]",
              "focus:outline-none focus:ring-2 focus:ring-[#2E8B57] focus:border-transparent",
              "disabled:cursor-not-allowed disabled:opacity-50",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              error && "border-[#EF4444] focus:ring-[#EF4444]",
              className
            )}
            ref={ref}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-[#EF4444]">{error}</p>}
        {hint && !error && <p className="text-sm text-[#6B7280]">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
