import { currentUser } from "@clerk/nextjs/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { requireAdmin } from "@/lib/auth/role-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};


export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const user = await currentUser();

  return (
    <div className="flex h-screen bg-[#F9FAFB]">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminTopBar user={user as unknown as import("@clerk/types").UserResource} />
        <main className="flex-1 overflow-y-auto p-6 md:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
