"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error
    console.error("Route Error Boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">Something went wrong!</h2>
        <p className="mb-6 text-gray-500 text-sm">
          We had trouble loading this section.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="w-full rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Try again
          </button>
          <Link 
            href="/dashboard"
            className="w-full rounded-lg bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
