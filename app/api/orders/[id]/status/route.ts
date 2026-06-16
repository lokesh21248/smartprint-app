import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderStatusUpdateSchema } from "@/lib/validators";
import type { OrderStatus } from "@/types";

const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PLACED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PRINTING", "CANCELLED"],
  PRINTING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = OrderStatusUpdateSchema.safeParse({ ...body, orderId: params.id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { newStatus, rejectionReason } = parsed.data;

    // Fetch order to verify ownership and current status
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, status, shop_id, status_history, customer_name, customer_phone, short_token, shops!inner(clerk_owner_id)")
      .eq("id", params.id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // ─── OWNERSHIP CHECK ─────────────────────────────────────────────────────
    // Verify the order belongs to a shop owned by the requesting user.
    // This prevents cross-tenant attacks (shop A updating shop B's orders).
    const shopData = order.shops as unknown as { clerk_owner_id: string } | null;
    if (!shopData || shopData.clerk_owner_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const currentStatus = order.status as OrderStatus; // live schema column name

    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from ${currentStatus} to ${newStatus}` },
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
    if (newStatus === "COMPLETED") {
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
    // FIX Fix12: removed incorrect `await` — sendStatusUpdate() is void and runs
    // its DB insert in the background via Promise.resolve(). The await was misleading
    // and didn't actually wait for anything meaningful.
    const { NotificationService } = await import("@/lib/notifications");
    NotificationService.sendStatusUpdate({
      orderId: order.id,
      phone: order.customer_phone,
      customerName: order.customer_name,
      status: newStatus,
      shortToken: order.short_token,
    });

    return NextResponse.json({ success: true, order_status: newStatus });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
