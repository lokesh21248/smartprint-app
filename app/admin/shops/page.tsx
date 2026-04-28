import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ShopsListClient } from "@/components/admin/ShopsListClient";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Manage Shops | Admin" };

export default async function AdminShopsPage() {
  const supabase = await createClient();
  const { data: shops } = await supabase
    .from("shops")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Manage Shops</h1>
          <p className="text-gray-500 mt-1">Onboard and manage print shop partners</p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 gap-2">
          <Plus className="h-4 w-4" />
          Onboard New Shop
        </Button>
      </div>

      <ShopsListClient initialShops={shops || []} />
    </div>
  );
}
