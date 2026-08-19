import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderStatusUpdateSchema } from "@/lib/validators";
import { canManageShop, withShopAccessCache } from "@/lib/auth/shop-access";
import { rateLimit } from "@/lib/ratelimit";
import { NotificationService } from "@/lib/notifications";

// State machine defining all valid transitions between order statuses.
// Keys and values are lowercase for case-insensitive matching.
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["placed", "accepted", "cancelled"],
  new: ["accepted", "printing", "cancelled"],
  placed: ["accepted", "printing", "cancelled"],
  accepted: ["printing", "ready", "cancelled"],
  printing: ["ready", "completed", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const isDev = process.env.NODE_ENV !== "production" || process.env.PERF_LOG === "true";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return withShopAccessCache(async () => {
    const t0 = performance.now();
    try {
      // 1. Auth & Rate Limit
      const tAuth0 = performance.now();
      const authObj = await auth();
      const userId = authObj.userId;
      if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const tAuth = performance.now() - tAuth0;

      const { success } = rateLimit(`order_status_update_${userId}`, 60, 60);
      if (!success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }

      // 2. Validation
      const tVal0 = performance.now();
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const parsed = OrderStatusUpdateSchema.safeParse({ ...body, orderId: params.id });
      if (!parsed.success) {
        if (isDev) {
          console.error("[ORDER STATUS] Validation failed (schema):", parsed.error.flatten());
        }
        return NextResponse.json(
          { error: "Invalid status update payload", details: parsed.error.flatten() },
          { status: 400 }
        );
      }
      const { newStatus, rejectionReason } = parsed.data;
      const targetStatus = newStatus.trim().toLowerCase();
      const tVal = performance.now() - tVal0;

      const supabase = createAdminClient();

      // 3. Database fetch: fetch existing order to verify ownership & current status
      const tFetch0 = performance.now();
      const { data: order, error: fetchError } = await supabase
        .from("orders")
        .select("id, status, shop_id, status_history, customer_name, customer_phone, short_token")
        .eq("id", params.id)
        .single();

      if (fetchError || !order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      const tFetch = performance.now() - tFetch0;

      // 4. Ownership Check
      const clerkRole = String(
        (authObj.sessionClaims?.metadata as Record<string, unknown> | undefined)?.role ?? ""
      )
        .trim()
        .toLowerCase();

      const isAuthorized = await canManageShop(userId, order.shop_id, clerkRole);
      if (!isAuthorized) {
        return NextResponse.json({ error: "Forbidden: Not authorized to manage this shop" }, { status: 403 });
      }

      // 5. State Machine & Idempotency Check
      const rawCurrent = String(order.status || "").trim().toLowerCase();
      // Normalize 'new' → 'placed' for display/comparison if needed, but treat both as equivalent
      const currentStatus = rawCurrent === "new" ? "placed" : rawCurrent;
      const normalizedTarget = targetStatus === "new" ? "placed" : targetStatus;

      // IDEMPOTENT FAST-PATH: If the order is already in the requested state, return 200 OK immediately
      // This completely eliminates 422 errors from double clicks, network retries, or concurrent updates.
      if (currentStatus === normalizedTarget || rawCurrent === targetStatus) {
        if (isDev) {
          console.log(`[ORDER STATUS] Idempotent update: Order ${params.id} is already '${currentStatus}'`);
        }
        return NextResponse.json(
          { success: true, order_status: newStatus, message: "Order is already in this status" },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      const allowed = VALID_TRANSITIONS[rawCurrent] ?? VALID_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(targetStatus) && !allowed.includes(normalizedTarget)) {
        if (isDev) {
          console.error(
            `[ORDER STATUS] Invalid transition: '${order.status}' (${currentStatus}) → '${newStatus}' for order ${params.id}`
          );
        }
        const friendlyError =
          allowed.length === 0
            ? `Order #${order.short_token || params.id} is ${String(order.status).toUpperCase()} and cannot be modified further.`
            : `Cannot change order from '${String(order.status).toUpperCase()}' to '${newStatus.toUpperCase()}'. Allowed transitions: ${allowed.map((s) => s.toUpperCase()).join(", ")}.`;

        return NextResponse.json(
          {
            error: friendlyError,
            currentStatus: order.status,
            targetStatus: newStatus,
            allowedTransitions: allowed,
          },
          { status: 422 }
        );
      }

      // 6. Perform Status Update
      const tUpdate0 = performance.now();
      const dbStatus = newStatus.toUpperCase();

      const newHistoryEntry = {
        status: dbStatus,
        at: new Date().toISOString(),
        actor: "shop",
        note: rejectionReason ?? undefined,
      };

      const updatedHistory = [
        ...(Array.isArray(order.status_history) ? order.status_history : []),
        newHistoryEntry,
      ];

      const updatePayload: Record<string, unknown> = {
        status: dbStatus,
        status_history: updatedHistory,
        updated_at: new Date().toISOString(),
      };
      if (targetStatus === "completed") {
        updatePayload.completed_at = new Date().toISOString();
      }
      if (rejectionReason) {
        updatePayload.cancellation_reason = rejectionReason;
      }

      const { error: updateError } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", params.id);

      if (updateError) {
        console.error("[ORDER STATUS] Update error:", {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        });
        return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
      }

      // If the order is moving out of NEW/PLACED, automatically mark its new_order notification as read
      if (currentStatus === "placed" && normalizedTarget !== "placed") {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("id", params.id); // Notification ID matches Order ID for new orders
      }

      const tUpdate = performance.now() - tUpdate0;

      // 7. Fire-and-forget customer notification (never blocks API response)
      NotificationService.sendStatusUpdate({
        orderId: order.id,
        phone: order.customer_phone,
        customerName: order.customer_name,
        status: newStatus,
        shortToken: order.short_token,
      });

      const totalTime = performance.now() - t0;
      if (isDev) {
        console.log(
          `[ORDER API] Status Update (ID: ${params.id}, ${order.status} → ${dbStatus}) | ` +
            `auth: ${tAuth.toFixed(1)}ms | val: ${tVal.toFixed(1)}ms | ` +
            `fetch: ${tFetch.toFixed(1)}ms | update: ${tUpdate.toFixed(1)}ms | total: ${totalTime.toFixed(1)}ms`
        );
      }

      return NextResponse.json(
        { success: true, order_status: newStatus, order_id: params.id },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch (error) {
      console.error("[ORDER STATUS] Unexpected error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  });
}

