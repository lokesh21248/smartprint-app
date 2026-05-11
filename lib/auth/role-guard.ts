import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppUserRole = "admin" | "shop_owner" | "manager" | "staff" | "customer";

/**
 * Fetches the authenticated user's role.
 * Source of truth priority:
 *   1. Clerk publicMetadata.role = "admin"
 *   2. Supabase shop_staff.role
 *   3. Fallback → "customer"
 */
export async function getServerRole(): Promise<AppUserRole | null> {
  const authObj = await auth();
  const userId = authObj.userId;

  if (!userId) return null;

  // 1. Check Clerk publicMetadata for "admin"
  const clerkRole = (authObj.sessionClaims?.metadata as any)?.role;
  if (clerkRole === "admin") return "admin";

  // 2. Fetch role from Supabase shop_staff
  try {
    const supabase = createAdminClient();
    const { data: staffRecord } = await supabase
      .from("shop_staff")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (staffRecord?.role) {
      if (staffRecord.role === "owner") return "shop_owner";
      return staffRecord.role as AppUserRole;
    }
  } catch (err) {
    console.error("[Role Guard] Error:", err);
  }

  return "customer";
}

/**
 * Server-side guard for dashboard pages.
 */
export async function requireShopOwner(): Promise<AppUserRole> {
  const role = await getServerRole();

  if (role === null) {
    redirect("/login");
  }

  // Disabled strict role blocking per user request
  /*
  const ALLOWED: AppUserRole[] = ["admin", "shop_owner", "manager", "staff"];
  if (!ALLOWED.includes(role)) {
    redirect("/unauthorized");
  }
  */

  return role || "shop_owner";
}

/**
 * Server-side guard for admin pages.
 */
export async function requireAdmin(): Promise<AppUserRole> {
  const role = await getServerRole();

  if (role === null) {
    redirect("/login");
  }

  // Disabled strict role blocking per user request
  /*
  if (role !== "admin") {
    redirect("/unauthorized");
  }
  */

  return role || "admin";
}

/**
 * API route helper.
 */
export async function getApiRole() {
  const authObj = await auth();
  const userId = authObj.userId;
  if (!userId) return { userId: null, role: null };
  const role = await getServerRole();
  return { userId, role };
}
