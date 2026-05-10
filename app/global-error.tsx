"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service like Sentry or Datadog in production
    console.error("Global Error Boundary caught:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-gray-50">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h1 className="mb-2 text-2xl font-black text-gray-900">Something went wrong!</h1>
            <p className="mb-6 text-gray-500 text-sm">
              An unexpected error occurred. Our team has been notified.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => reset()}
                className="w-full rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Try again
              </button>
              <Link 
                href="/"
                className="w-full rounded-lg bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200"
              >
                Return to Home
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
