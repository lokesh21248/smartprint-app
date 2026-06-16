import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/cleanup-logs
 *
 * Returns recent cleanup run history for admin dashboards and debugging.
 * Auth: Clerk session required (admin/owner only — Clerk gate is the simplest lock here).
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Verify user is a shop member (owner or staff)
  const { getUserShop } = await import("@/lib/auth/shop-access");
  const shopId = await getUserShop(userId);

  if (!shopId) {
    return NextResponse.json({ error: "Forbidden: shop members only" }, { status: 403 });
  }

  const { data: logs, error } = await supabase
    .from("cleanup_logs")
    .select("id, deleted_count, status, errors, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[cleanup-logs] Fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: logs ?? [] });
}
