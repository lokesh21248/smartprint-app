import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopBar } from "@/components/admin/AdminTopBar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId || !user) {
    redirect("/sign-in?redirect_url=/admin/dashboard");
  }

  // Role check: In a real app, check user.publicMetadata.role === 'admin'
  // For now, we'll allow if it's the specific admin email or has the metadata
  const isAdmin = user.publicMetadata.role === "admin" || user.emailAddresses[0].emailAddress === "admin@smartprint.com";

  if (!isAdmin) {
    redirect("/dashboard");
  }

  return (
    <div className="flex h-screen bg-[#F9FAFB]">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminTopBar user={user} />
        <main className="flex-1 overflow-y-auto p-6 md:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
