import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateShopForm } from "@/components/shop/CreateShopForm";

export const metadata = {
  title: "Create your shop",
  robots: { index: false, follow: false },
};

export default async function CreateShopPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("shops")
    .select("id")
    .eq("clerk_owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (existing) redirect("/dashboard");

  const user = await currentUser();
  const ownerName =
    (user?.unsafeMetadata?.ownerName as string | undefined) ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "";
  const email = user?.emailAddresses?.[0]?.emailAddress || "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E8F5EE] via-white to-[#E8F1F8] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#111827] mb-2">Set up your shop</h1>
          <p className="text-[#6B7280]">One last step — tell us about your print shop.</p>
        </div>
        <div className="bg-white rounded-3xl shadow-lg border border-[#E5E7EB] p-8">
          <CreateShopForm initialOwnerName={ownerName} ownerEmail={email} />
        </div>
      </div>
    </div>
  );
}
