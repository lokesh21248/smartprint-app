"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-white hover:bg-primary-dark focus-visible:ring-primary shadow-sm shadow-emerald-950/[0.04]",
        destructive:
          "bg-danger text-white hover:bg-red-600 focus-visible:ring-red-500 shadow-sm shadow-rose-950/[0.04]",
        outline:
          "border border-slate-200/80 bg-white text-slate-800 hover:bg-slate-50/80 hover:border-slate-350 focus-visible:ring-primary shadow-sm shadow-slate-900/[0.01]",
        secondary:
          "bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400 border border-slate-100/50",
        ghost:
          "text-slate-500 hover:bg-slate-50 hover:text-slate-850 focus-visible:ring-slate-400",
        link: "text-primary underline-offset-4 hover:underline focus-visible:ring-primary",
        warning:
          "bg-warning text-white hover:bg-amber-600 focus-visible:ring-amber-500 shadow-sm shadow-amber-950/[0.04]",
        accent:
          "bg-accent text-white hover:bg-accent/90 focus-visible:ring-accent shadow-sm",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-3 text-xs rounded-lg",
        lg: "h-13 px-7 text-base rounded-xl",
        xl: "h-15 px-9 text-lg rounded-2xl",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Loading…</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
