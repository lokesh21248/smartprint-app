"use client";

import { OrderCardSkeleton } from "@/components/ui/skeleton";

export function OrdersSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  );
}
