import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderStatusUpdateSchema } from "@/lib/validators";
import type { OrderStatus } from "@/types";
import { canManageShop } from "@/lib/auth/shop-access";
import { rateLimit } from "@/lib/ratelimit";
// Static import — eliminates dynamic module-resolution overhead on every status change
import { NotificationService } from "@/lib/notifications";

// Both 'placed' (older orders) and 'new' (normalized orders) map to the same
// allowed transitions. Using lowercase keys because currentStatus is .toLowerCase()d
// before lookup.
const VALID_TRANSITIONS: Partial<Record<string, string[]>> = {
  new: ["accepted", "cancelled"],
  placed: ["accepted", "cancelled"], // alias for 'new' — legacy DB value
  accepted: ["printing", "cancelled"],
  printing: ["ready", "cancelled"],
  ready: ["completed"],
};

/**
 * PATCH /api/orders/[id]/status
 *
 * ⚠️  WAL & WRITE OPTIMIZATION:
 * - This route performs an atomic UPDATE.
 * - Do NOT wrap this in a loop for multiple orders — use a batch .in() update instead.
 * - JSONB `status_history` is appended on the server. If this array grows beyond 50 entries,
 *   consider moving to a separate `order_events` table to prevent WAL bloat.
 *
 * ⚠️  PARTITION & INDEXING:
 * - This query hits the monthly partition based on the `id` (UUID).
 * - Partial index `idx_orders_no_duplicate` ignores 'CANCELLED'/'DRAFT' to keep index size small.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authObj = await auth();
    const userId = authObj.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { success } = rateLimit(`order_status_update_${userId}`, 60, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    console.log('[ORDER STATUS] Request body:', body);

    const parsed = OrderStatusUpdateSchema.safeParse({ ...body, orderId: params.id });
    if (!parsed.success) {
      console.error('[ORDER STATUS] Validation failed (schema):', parsed.error.flatten());
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { newStatus, rejectionReason } = parsed.data;

    // Fetch order to verify ownership and current status
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, status, shop_id, status_history, customer_name, customer_phone, short_token")
      .eq("id", params.id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // ─── OWNERSHIP CHECK ─────────────────────────────────────────────────────
    // Verify the user is authorized to manage the shop associated with this order.
    // This supports owners, managers, staff, and admins.
    const clerkRole = String(
      (authObj.sessionClaims?.metadata as Record<string, unknown> | undefined)?.role ?? ""
    )
      .trim()
      .toLowerCase();

    const isAuthorized = await canManageShop(userId, order.shop_id, clerkRole);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const currentStatus = String(order.status).toLowerCase(); // live schema column name, normalized

    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      console.error(`[ORDER STATUS] Invalid transition: '${currentStatus}' → '${newStatus}' for order ${params.id}`);
      // Return the specific transition error so the client can show a useful message.
      // The status values here are safe to expose (no credentials or SQL).
      const friendlyError = allowed.length === 0
        ? `This order cannot be updated from its current state.`
        : `Cannot change this order to '${newStatus}' from its current state.`;
      return NextResponse.json(
        { error: friendlyError },
        { status: 422 }
      );
    }

    const newHistoryEntry = {
      status: newStatus,
      at: new Date().toISOString(),
      actor: "shop",
      note: rejectionReason ?? undefined,
    };

    const updatedHistory = [
      ...(Array.isArray(order.status_history) ? order.status_history : []),
      newHistoryEntry,
    ];

    const updatePayload: Record<string, unknown> = {
      status: newStatus,              // live schema column name
      status_history: updatedHistory,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === "completed") {
      updatePayload.completed_at = new Date().toISOString();
    }
    if (rejectionReason) updatePayload.cancellation_reason = rejectionReason;

    const { error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Send notification to customer — fire-and-forget (void return, never blocks response)
    NotificationService.sendStatusUpdate({
      orderId: order.id,
      phone: order.customer_phone,
      customerName: order.customer_name,
      status: newStatus,
      shortToken: order.short_token,
    });

    return NextResponse.json(
      { success: true, order_status: newStatus },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
