import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export type AppUserRole = "admin" | "shop_owner" | "manager" | "staff" | "customer";

/**
 * Fetches the authenticated user's role.
 *
 * Fast-path: reads role from Clerk session claims (0 DB calls).
 * Slow-path: falls back to 2 parallel Supabase queries only when claims
 *            don't contain a known role (e.g. freshly created users whose
 *            claims haven't been synced via the Clerk webhook yet).
 *
 * To maximize fast-path hits, sync the user's role into Clerk publicMetadata
 * whenever it changes (shop created, staff invited, etc.) via:
 *   clerkClient.users.updateUserMetadata(userId, { publicMetadata: { role } })
 */
export async function getServerRole(): Promise<AppUserRole | null> {
  const authObj = await auth();
  const userId = authObj.userId;

  if (!userId) return null;

  // ── 1. Fast-path: Clerk session claims (0 DB calls) ───────────────────────
  const clerkRole = String(
    (authObj.sessionClaims?.metadata as Record<string, unknown> | undefined)?.role ?? ""
  )
    .trim()
    .toLowerCase();

  if (clerkRole === "admin") return "admin";
  if (clerkRole === "shop_owner") return "shop_owner";
  if (clerkRole === "manager") return "manager";
  if (clerkRole === "staff") return "staff";

  // ── 2. Slow-path: DB lookup (2 parallel queries) ──────────────────────────
  // Only reached when session claims don't have a recognized role.
  try {
    const supabase = createAdminClient();

    const [ownerRes, staffRes] = await Promise.all([
      supabase.from("shops").select("id").eq("clerk_owner_id", userId).maybeSingle(),
      supabase.from("shop_staff").select("role").eq("user_id", userId).maybeSingle(),
    ]);

    if (ownerRes.data) {
      return "shop_owner";
    }

    if (staffRes.data?.role) {
      const rawRole = String(staffRes.data.role).trim().toLowerCase();
      if (rawRole === "owner" || rawRole === "shop_owner") return "shop_owner";
      if (rawRole === "manager") return "manager";
      if (rawRole === "staff") return "staff";
    }
  } catch (err) {
    console.error("[ROLE GUARD ERROR]", err);
  }

  return "customer";
}

/**
 * Guard for dashboard pages (owners, admins, managers, staff).
 * Redirects to /login if not authenticated.
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
 * Redirects to /login if not authenticated, /unauthorized if not admin.
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
 *
 * @param allowedRoles  Roles permitted to access the endpoint.
 * @returns { authorized, userId, role, response? }
 *
 * Usage:
 *   const { authorized, response, userId } = await validateApiAccess(["shop_owner"]);
 *   if (!authorized) return response!;
 */
export async function validateApiAccess(
  allowedRoles: AppUserRole[] = ["admin", "shop_owner", "manager", "staff"]
): Promise<
  | { authorized: true; userId: string; role: AppUserRole; response?: never }
  | { authorized: false; userId?: string; role?: AppUserRole; response: NextResponse }
> {
  const authObj = await auth();
  const userId = authObj.userId;

  if (!userId) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const role = await getServerRole();
  const isAuthorized = role !== null && allowedRoles.includes(role);

  if (!isAuthorized) {
    return {
      authorized: false,
      userId,
      role: role ?? undefined,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { authorized: true, userId, role: role! };
}

/**
 * Logs an admin action to the structured log stream.
 */
export function logAdminAction(params: {
  userId: string;
  action: string;
  affectedCount?: number;
  ip?: string;
  isDryRun?: boolean;
}) {
  console.log(
    JSON.stringify({
      status: "admin_action",
      ...params,
      timestamp: new Date().toISOString(),
    })
  );
}
