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
export async function canManageShop(userId: string, shopId: string): Promise<boolean> {
  if (!userId || !shopId) return false;

  // 1. Clerk session claims check first (fast path for admin)
  const authObj = await auth();
  const clerkRole = String(
    (authObj.sessionClaims?.metadata as Record<string, unknown> | undefined)?.role ?? ""
  )
    .trim()
    .toLowerCase();

  if (clerkRole === "admin") return true;

  const supabase = createAdminClient();

  // 2. Database lookup
  // Check if they are the owner of the shop
  const { data: shop } = await supabase
    .from("shops")
    .select("clerk_owner_id")
    .eq("id", shopId)
    .maybeSingle();

  if (shop && shop.clerk_owner_id === userId) {
    return true;
  }

  // Check if they are assigned staff or manager in shop_staff table
  const { data: staffRecord } = await supabase
    .from("shop_staff")
    .select("role")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .maybeSingle();

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
