"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import dynamic from "next/dynamic";

const ReactQueryDevtools = dynamic(
  () =>
    import("@tanstack/react-query-devtools").then(
      (mod) => mod.ReactQueryDevtools
    ),
  { ssr: false }
);

/**
 * AuthQueryCacheSync:
 * Monitors Clerk auth state and purges TanStack Query client cache whenever
 * the authenticated user changes (login, logout, or account switch).
 * Guarantees zero leakage of shop stats, orders, or profile data between accounts.
 */
function AuthQueryCacheSync() {
  const { userId, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const prevUserRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    if (prevUserRef.current !== undefined && prevUserRef.current !== userId) {
      queryClient.clear();
      if (process.env.NODE_ENV !== "production") {
        console.log(`[TanStack Query] Auth state transition (${prevUserRef.current} -> ${userId}): Cache cleared.`);
      }
    }
    prevUserRef.current = userId;
  }, [userId, isLoaded, queryClient]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 60s staleTime prevents redundant refetches during normal navigation.
            // Realtime subscriptions handle live data freshness for orders/stats.
            staleTime: 60 * 1000,
            // 10 minutes garbage collection time keeps warm data during brief screen transitions.
            gcTime: 10 * 60 * 1000,
            // Disabled globally — individual queries opt in if they genuinely need it.
            // On-focus refetch caused API spam when users switch browser tabs.
            refetchOnWindowFocus: false,
            // 1 retry is enough: if the server is down, a second attempt 1s later
            // rarely recovers and just delays the error state for the user.
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthQueryCacheSync />
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        duration={4000}
        toastOptions={{
          style: { fontFamily: "Inter, system-ui, sans-serif" },
        }}
      />
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
