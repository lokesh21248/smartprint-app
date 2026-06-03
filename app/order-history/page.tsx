import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// /order-history is an authenticated app page.
// We mark it noindex so Google doesn't try to crawl behind the login wall.
// The dashboard layout already sets noindex at the group level, but this
// page lives outside that group, so we set it explicitly here too.
export const metadata: Metadata = {
  title: "Order History | Scan2Paper",
  description:
    "View your complete print order history on Scan2Paper.",
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

  // Authenticated placeholder — replace with real order history query
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center border border-gray-100 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Order History</h1>
        <p className="text-gray-500 text-sm">
          Your complete print order history will appear here.
        </p>
      </div>
    </main>
  );
}
