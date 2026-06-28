"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import dynamic from "next/dynamic";

const ReactQueryDevtools = dynamic(
  () =>
    import("@tanstack/react-query-devtools").then(
      (mod) => mod.ReactQueryDevtools
    ),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 60s staleTime prevents redundant refetches during normal navigation.
            // Realtime subscriptions handle live data freshness for orders/stats.
            staleTime: 60 * 1000,
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
