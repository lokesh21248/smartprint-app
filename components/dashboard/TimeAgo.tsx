"use client";

import { useEffect, useState } from "react";
import { formatTimeAgo } from "@/lib/utils";

interface TimeAgoProps {
  date: string;
  className?: string;
}

/**
 * TimeAgo Component
 * 
 * Prevents React Hydration errors by only rendering the relative time 
 * after the component has mounted on the client.
 */
export function TimeAgo({ date, className }: TimeAgoProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a stable placeholder or the absolute date for SSR
    return <span className={className}>...</span>;
  }

  return (
    <span className={className} title={new Date(date).toLocaleString()}>
      {formatTimeAgo(date)}
    </span>
  );
}
