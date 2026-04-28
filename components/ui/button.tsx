import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-base font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 btn-press select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[#2E8B57] text-white hover:bg-[#1F6B42] focus-visible:ring-[#2E8B57] shadow-sm",
        destructive:
          "bg-[#EF4444] text-white hover:bg-red-600 focus-visible:ring-red-500 shadow-sm",
        outline:
          "border-2 border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#FAFAFA] hover:border-[#D1D5DB] focus-visible:ring-[#2E8B57]",
        secondary:
          "bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB] focus-visible:ring-[#6B7280]",
        ghost:
          "text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] focus-visible:ring-[#6B7280]",
        link: "text-[#2E8B57] underline-offset-4 hover:underline focus-visible:ring-[#2E8B57]",
        warning:
          "bg-[#F59E0B] text-white hover:bg-amber-600 focus-visible:ring-amber-500 shadow-sm",
        accent:
          "bg-[#1F4E79] text-white hover:bg-blue-900 focus-visible:ring-[#1F4E79] shadow-sm",
      },
      size: {
        default: "h-12 px-5 py-2",
        sm: "h-9 px-3 text-sm rounded-lg",
        lg: "h-14 px-8 text-lg rounded-xl",
        xl: "h-16 px-10 text-xl rounded-2xl",
        icon: "h-12 w-12",
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
