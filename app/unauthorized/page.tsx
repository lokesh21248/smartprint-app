import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Access Denied | Scan2Paper",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 text-center border border-gray-100">
        <div className="w-20 h-20 rounded-3xl bg-rose-50 flex items-center justify-center mx-auto mb-8 shadow-inner">
          <ShieldAlert className="w-10 h-10 text-rose-500" />
        </div>
        
        <h1 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">
          Access Denied
        </h1>
        
        <p className="text-gray-500 font-medium mb-10 leading-relaxed">
          You don&apos;t have permission to access this area. This area is restricted to shop owners and administrators only.
        </p>

        <div className="space-y-4">
          <Button asChild className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-lg shadow-emerald-600/20">
            <Link href="/">
              <Home className="mr-2 h-5 w-5" /> Back to Home
            </Link>
          </Button>
          
          <Button asChild variant="ghost" className="w-full h-14 rounded-2xl font-bold text-gray-500 hover:bg-gray-50">
            <Link href="javascript:history.back()">
              <ArrowLeft className="mr-2 h-5 w-5" /> Go Back
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
