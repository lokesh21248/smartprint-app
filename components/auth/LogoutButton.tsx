"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface LogoutButtonProps {
  className?: string;
  showText?: boolean;
}

export function LogoutButton({ className = "", showText = true }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const { signOut } = useClerk();

  const router = useRouter();

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut();
      router.push("/login");
    } catch {
      toast.error("Logout failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {showText && <span>Logging out...</span>}
        </>
      ) : (
        <>
          <LogOut className="w-4 h-4" />
          {showText && <span>Logout</span>}
        </>
      )}
    </button>
  );
}
