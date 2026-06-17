import { createAdminClient } from "@/lib/supabase/admin";
import { auth } from "@clerk/nextjs/server";

/**
 * Resolves the shop ID associated with a user.
 * Checks ownership first, then falls back to staff assignments.
 *
 * @param userId Clerk User ID
 */
export async function getUserShop(userId: string): Promise<string | null> {
  if (!userId) return null;
  const supabase = createAdminClient();

  // 1. Check if the user is the owner of a shop
  const { data: ownerShop } = await supabase
    .from("shops")
    .select("id")
    .eq("clerk_owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (ownerShop) {
    return ownerShop.id;
  }

  // 2. Check if the user is a staff/manager in shop_staff
  const { data: staffRecord } = await supabase
    .from("shop_staff")
    .select("shop_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (staffRecord) {
    return staffRecord.shop_id;
  }

  return null;
}

/**
 * Validates if a user has access to manage a shop.
 * Allowed roles: admin (any shop), shop owner, manager (assigned shop), staff (assigned shop).
 *
 * @param userId Clerk User ID
 * @param shopId Target Shop ID
 */
export async function canManageShop(
  userId: string,
  shopId: string,
  clerkRole?: string
): Promise<boolean> {
  if (!userId || !shopId) return false;

  // 1. Clerk session claims check first (fast path for admin)
  let resolvedClerkRole = clerkRole;
  if (resolvedClerkRole === undefined) {
    const authObj = await auth();
    resolvedClerkRole = String(
      (authObj.sessionClaims?.metadata as Record<string, unknown> | undefined)?.role ?? ""
    )
      .trim()
      .toLowerCase();
  }

  if (resolvedClerkRole === "admin") return true;

  const supabase = createAdminClient();

  // 2. Database lookup - Parallelized (FIX P1)
  const [shopResult, staffResult] = await Promise.all([
    supabase
      .from("shops")
      .select("clerk_owner_id")
      .eq("id", shopId)
      .maybeSingle(),
    supabase
      .from("shop_staff")
      .select("role")
      .eq("shop_id", shopId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const shop = shopResult.data;
  const staffRecord = staffResult.data;

  if (shop && shop.clerk_owner_id === userId) {
    return true;
  }

  if (staffRecord) {
    const rawRole = String(staffRecord.role).trim().toLowerCase();
    if (
      rawRole === "owner" ||
      rawRole === "shop_owner" ||
      rawRole === "manager" ||
      rawRole === "staff"
    ) {
      return true;
    }
  }

  return false;
}
