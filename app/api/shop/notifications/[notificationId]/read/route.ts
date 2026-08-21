import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserShop } from "@/lib/auth/shop-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/shop/notifications/:notificationId/read
 *
 * Marks a single notification as read.
 *
 * IDOR PROTECTION:
 * - The UPDATE is scoped to both `id` AND `shop_id = authenticatedShopId`.
 * - Even if Shop A guesses Shop B's notification UUID, the WHERE clause
 *   will match 0 rows because shop_id won't match.
 * - This eliminates the BOLA/IDOR vulnerability.
 *
 * SECURITY:
 * - shopId is NEVER taken from the request body or URL params.
 * - It is derived server-side from the authenticated Clerk session.
 */
export async function PATCH(
  _request: Request,
  { params }: { params: { notificationId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { notificationId } = params;
    if (!notificationId) {
      return NextResponse.json({ error: "notificationId is required" }, { status: 400 });
    }

    // Derive shopId from the authenticated user — never trust URL/body params
    const shopId = await getUserShop(userId);
    if (!shopId) {
      return NextResponse.json({ error: "No shop found for this user" }, { status: 404 });
    }

    const supabase = createAdminClient();

    // IDOR-safe UPDATE: scoped by both id AND shop_id
    // If the notification belongs to a different shop, 0 rows are updated
    const { error, count } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("shop_id", shopId);

    if (error) {
      console.error("[PATCH /api/shop/notifications/.../read] DB error:", error.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // count === 0 means either the notification doesn't exist or it belongs to another shop
    if (count === 0) {
      return NextResponse.json(
        { error: "Notification not found or not authorized" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[PATCH /api/shop/notifications/.../read] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
