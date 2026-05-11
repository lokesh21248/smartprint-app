import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export type UserRole = "admin" | "shop_owner" | "manager" | "staff" | "customer";

/**
 * Fetches the user's role from Supabase or Clerk Metadata.
 * Prioritizes the database as the source of truth for security.
 */
export async function getServerRole(): Promise<UserRole> {
  const authObj = await auth();
  const userId = authObj.userId;

  if (!userId) return "customer";

  // 1. Check for Super Admin in Clerk Metadata (for internal team)
  const clerkRole = authObj.sessionClaims?.metadata?.role as string | undefined;
  if (clerkRole === "admin") return "admin";

  // 2. Fetch role from Supabase shop_staff table (Source of Truth)
  // We use the admin client to bypass RLS for this specific check
  const supabase = createAdminClient();
  const { data: staffRecord, error } = await supabase
    .from("shop_staff")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[Role Guard] DB Error:", error.message);
  }

  if (staffRecord?.role) {
    // Map internal DB roles to our UserRole type
    if (staffRecord.role === "owner") return "shop_owner";
    return staffRecord.role as UserRole;
  }

  // 3. Fallback to Clerk Metadata if DB record is missing but metadata exists
  if (clerkRole) return clerkRole as UserRole;

  return "customer";
}

/**
 * Server-side guard to ensure only admins or shop owners can access.
 * Usage: await requireShopOwner(); at the top of Server Components or Layouts.
 */
export async function requireShopOwner() {
  const role = await getServerRole();
  
  if (role !== "admin" && role !== "shop_owner") {
    console.warn(`[Security] Unauthorized access attempt by user. Role: ${role}`);
    redirect("/unauthorized");
  }
  
  return role;
}

/**
 * Server-side guard to ensure only site-wide admins can access.
 */
export async function requireAdmin() {
  const role = await getServerRole();
  
  if (role !== "admin") {
    console.warn(`[Security] Unauthorized admin access attempt.`);
    redirect("/unauthorized");
  }
  
  return role;
}
