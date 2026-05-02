import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors border",
  {
    variants: {
      variant: {
        default: "bg-[#2E8B57] text-white border-transparent",
        secondary: "bg-[#F3F4F6] text-[#374151] border-[#E5E7EB]",
        destructive: "bg-[#FEE2E2] text-[#B91C1C] border-[#FCA5A5]",
        warning: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
        success: "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]",
        outline: "border-[#E5E7EB] text-[#374151] bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
