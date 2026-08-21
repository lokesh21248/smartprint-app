import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserShop } from "@/lib/auth/shop-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shop/notifications
 *
 * Returns the authenticated shop's notifications.
 *
 * SECURITY:
 * - shop_id is NEVER taken from query params or request body.
 * - It is derived server-side from the authenticated Clerk user → their shop.
 * - This prevents IDOR: Shop A cannot query Shop B's notifications.
 *
 * PERFORMANCE:
 * - Fetches only the columns needed by the frontend.
 * - Filtered to is_read = false by default (add ?all=1 for all notifications).
 * - Hard limit of 20 rows — never returns thousands of historical notifications.
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Derive shopId from the authenticated user — never trust client input
    const shopId = await getUserShop(userId);
    if (!shopId) {
      return NextResponse.json({ error: "No shop found for this user" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get("all") === "1";

    const supabase = createAdminClient();
    let query = supabase
      .from("notifications")
      .select("id, shop_id, type, title, body, data, is_read, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!showAll) {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[GET /api/shop/notifications] DB error:", error.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const notifications = (data ?? []).map((n) => ({
      id: n.id as string,
      type: n.type as string,
      orderId: (n.data as Record<string, unknown>)?.order_id as string | undefined,
      title: n.title as string,
      message: n.body as string,
      isRead: Boolean(n.is_read),
      createdAt: n.created_at as string,
      // Full data blob for the UI toast card
      data: n.data as Record<string, unknown>,
    }));

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return NextResponse.json(
      { notifications, unreadCount },
      {
        headers: {
          // Never cache — always fetch fresh from the DB
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[GET /api/shop/notifications] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
