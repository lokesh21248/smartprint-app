import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export type AppUserRole = "admin" | "shop_owner" | "manager" | "staff" | "customer";

/**
 * Fetches the authenticated user's role.
 * Normalizes values from Clerk and Supabase.
 */
export async function getServerRole(): Promise<AppUserRole | null> {
  const authObj = await auth();
  const userId = authObj.userId;

  if (!userId) return null;

  // 1. Clerk Admin Check
  const clerkRole = String((authObj.sessionClaims?.metadata as any)?.role || "").toLowerCase();
  if (clerkRole === "admin") {
    return "admin";
  }

  // 2. Database Check
  try {
    const supabase = createAdminClient();

    const [ownerRes, staffRes] = await Promise.all([
      supabase.from("shops").select("id").eq("clerk_owner_id", userId).maybeSingle(),
      supabase.from("shop_staff").select("role").eq("user_id", userId).maybeSingle()
    ]);

    if (ownerRes.data) {
      return "shop_owner";
    }

    if (staffRes.data?.role) {
      const rawRole = String(staffRes.data.role).trim().toLowerCase();
      let finalRole: AppUserRole = "customer";
      if (rawRole === "owner" || rawRole === "shop_owner") finalRole = "shop_owner";
      else if (rawRole === "manager") finalRole = "manager";
      else if (rawRole === "staff") finalRole = "staff";
      return finalRole;
    }
  } catch (err) {
    console.error("[ROLE GUARD ERROR]", err);
  }

  return "customer";
}

/**
 * Guard for dashboard pages (owners, admins, managers, staff).
 */
export async function requireShopOwner(): Promise<AppUserRole> {
  const role = await getServerRole();

  if (role === null) {
    redirect("/login");
  }

  return role;
}

/**
 * Guard for admin-only pages.
 */
export async function requireAdmin(): Promise<AppUserRole> {
  const role = await getServerRole();

  if (role === null) {
    redirect("/login");
  }

  if (role !== "admin") {
    redirect("/unauthorized");
  }

  return role;
}

/**
 * API-level validation helper.
 */
export async function validateApiAccess(allowedRoles: AppUserRole[] = ["admin", "shop_owner", "manager", "staff"]) {
  const authObj = await auth();
  const userId = authObj.userId;

  if (!userId) {
    return { authorized: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const role = await getServerRole();
  const isAuthorized = role && allowedRoles.includes(role);

  if (!isAuthorized) {
    return {
      authorized: false,
      role,
      userId,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    };
  }

  return { authorized: true, userId, role };
}
