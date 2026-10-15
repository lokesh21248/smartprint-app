import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getShopByUserId } from "@/lib/data/shop";
import Link from "next/link";
import { ArrowRight, FileText, Search } from "lucide-react";
import { Scan2PaperLogo } from "@/components/shared/Scan2PaperLogo";

export const metadata: Metadata = {
  title: "Order History | Scan2Paper",
  description: "View and manage your print order history on Scan2Paper.",
  robots: {
    index: false,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

export default async function OrderHistoryPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  // If the authenticated user is a shop owner or staff member, route them to their orders dashboard
  const shop = await getShopByUserId(userId);
  if (shop) {
    redirect("/dashboard/orders");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center border border-slate-100 shadow-xl space-y-6">
        <div className="flex justify-center mb-2">
          <Scan2PaperLogo variant="full" size={42} color="color" />
        </div>

        <div className="space-y-2">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Order History
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            No active print orders associated with this account. If you placed an order as a guest, you can track it anytime using your order tracking token.
          </p>
        </div>

        <div className="pt-2 space-y-3">
          <Link
            href="/find-shop"
            className="flex items-center justify-center gap-2 w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm transition shadow-sm hover:shadow"
          >
            <Search className="w-4 h-4" />
            Find a Print Shop Near You
          </Link>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-2xl font-semibold text-sm transition"
          >
            Back to Home
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}
