import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserShop } from "@/lib/auth/shop-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shop/notifications/unread
 *
 * Ultra-lightweight endpoint designed for client-side polling (every 8s).
 *
 * Returns only unread new_order notifications — the minimum data required
 * to update the badge count and trigger sound for genuinely new notifications.
 *
 * SECURITY:
 * - shopId is always derived server-side from the authenticated Clerk session.
 * - A shop owner can only see their own shop's notifications.
 *
 * PERFORMANCE:
 * - Partial index on (shop_id, is_read, created_at) covers this query exactly.
 * - Returns at most 20 rows — never a full history dump.
 * - No joins, no heavy columns (files, metadata, etc.).
 * - Cache-Control: no-store — CDN must never cache unread counts.
 *
 * Used by:
 * - GlobalNotificationProvider polling loop (fallback when Realtime is down)
 * - Initial dashboard load (first poll on mount)
 */
export async function GET() {
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

    const supabase = createAdminClient();

    // Lightweight query — only unread new_order notifications, minimal columns
    // Covered by: idx_notifications_shop_unread (partial index on is_read = false)
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, title, body, data, created_at")
      .eq("shop_id", shopId)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[GET /api/shop/notifications/unread] DB error:", error.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const notifications = (data ?? []).map((n) => ({
      id: n.id as string,
      type: n.type as string,
      orderId: (n.data as Record<string, unknown>)?.order_id as string | undefined,
      title: n.title as string,
      message: n.body as string,
      createdAt: n.created_at as string,
      // Full data blob so the UI toast card can render order details
      data: n.data as Record<string, unknown>,
    }));

    return NextResponse.json(
      {
        unreadCount: notifications.length,
        notifications,
      },
      {
        headers: {
          // Must not be cached — polling depends on fresh data every request
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[GET /api/shop/notifications/unread] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
