"use client";

import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shimmer rounded-xl", className)}
      {...props}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-14" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28 rounded-xl" />
          <Skeleton className="h-11 w-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export { Skeleton };
