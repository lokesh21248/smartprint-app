"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function SetupPolling() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? "" : prev + "."));
    }, 500);

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/shop");
        const data = await res.json();
        if (data?.shop) {
          window.location.reload();
        }
      } catch (err) {
        console.error("Polling failed:", err);
      }
    }, 3000);

    return () => {
      clearInterval(dotsInterval);
      clearInterval(pollInterval);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2 text-[#2E8B57] font-medium">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Setting up your account{dots}</span>
      </div>
      <p className="text-sm text-[#6B7280]">
        This usually takes less than 10 seconds.
      </p>
      <button 
        onClick={() => window.location.reload()}
        className="text-xs text-[#9CA3AF] hover:text-[#2E8B57] transition-colors underline underline-offset-4"
      >
        Refresh manually
      </button>
    </div>
  );
}
