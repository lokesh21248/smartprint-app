import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export type AppUserRole = "admin" | "shop_owner" | "manager" | "staff" | "customer";

/**
 * Fetches the authenticated user's role from Clerk (for admins) or Supabase (for shop staff).
 * Source of truth:
 *   1. Clerk publicMetadata.role === "admin"
 *   2. Supabase shop_staff table (owner, manager, staff)
 *   3. Fallback: "customer"
 */
export async function getServerRole(): Promise<AppUserRole | null> {
  const authObj = await auth();
  const userId = authObj.userId;

  if (!userId) return null;

  // 1. Check Clerk Metadata for global admin (Fastest)
  const clerkRole = (authObj.sessionClaims?.metadata as Record<string, unknown> | undefined)?.role as string | undefined;
  if (clerkRole === "admin") return "admin";

  // 2. Check Supabase for shop-specific roles
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
    console.error("[Security] Role lookup failed:", err);
  }

  return "customer";
}

/**
 * Page-level guard for Server Components (Layouts/Pages).
 * Redirects to /unauthorized if role is not allowed.
 */
export async function requireShopOwner() {
  const role = await getServerRole();
  
  if (!role) redirect("/login");
  
  const ALLOWED: AppUserRole[] = ["admin", "shop_owner"];
  if (!ALLOWED.includes(role)) {
    console.warn(`[Security] Unauthorized page access attempt. Role: ${role}`);
    redirect("/unauthorized");
  }
  
  return role;
}

/**
 * Page-level guard for global admin pages.
 */
export async function requireAdmin() {
  const role = await getServerRole();
  
  if (!role) redirect("/login");
  
  if (role !== "admin") {
    console.warn(`[Security] Unauthorized admin access attempt. Role: ${role}`);
    redirect("/unauthorized");
  }
  
  return role;
}

/**
 * API-level guard for Route Handlers.
 * Returns { authorized: boolean, response?: NextResponse, userId: string, role: AppUserRole }
 */
export async function validateApiAccess(allowedRoles: AppUserRole[] = ["admin", "shop_owner"]) {
  const authObj = await auth();
  const userId = authObj.userId;

  if (!userId) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const role = await getServerRole();
  
  if (!role || !allowedRoles.includes(role)) {
    console.warn(`[Security] Unauthorized API access attempt. Role: ${role}`);
    return {
      authorized: false,
      response: NextResponse.json({ error: "Forbidden: Access Denied" }, { status: 403 }),
      userId,
      role: role || "customer"
    };
  }

  return { authorized: true, userId, role };
}
