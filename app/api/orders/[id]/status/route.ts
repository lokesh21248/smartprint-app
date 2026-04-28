import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { OrderStatusUpdateSchema } from "@/lib/validators";
import type { OrderStatus } from "@/types";

const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PLACED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PRINTING", "CANCELLED"],
  PRINTING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = await createClient();

    const body = await request.json();
    const parsed = OrderStatusUpdateSchema.safeParse({ ...body, orderId: params.id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { newStatus, rejectionReason } = parsed.data;

    // Fetch order to verify ownership and current status
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, order_status, shop_id, status_history, scan_status, customer_name, customer_phone, short_token, shops!inner(owner_id)")
      .eq("id", params.id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Security Check: Virus Scanning
    if (newStatus === "ACCEPTED" && order.scan_status === "INFECTED") {
      return NextResponse.json(
        { error: "Cannot accept order with infected file. Please cancel." },
        { status: 422 }
      );
    }

    const currentStatus = order.order_status as OrderStatus;
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
      order_status: newStatus,
      status_history: updatedHistory,
      updated_at: new Date().toISOString(),
    };
    if (rejectionReason) updatePayload.notes = rejectionReason;

    const { error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Send notification to customer
    try {
      const { NotificationService } = await import("@/lib/notifications");
      await NotificationService.sendStatusUpdate({
        orderId: order.id,
        phone: order.customer_phone,
        customerName: order.customer_name,
        status: newStatus,
        shortToken: order.short_token,
      });
    } catch (notifErr) {
      console.error("Notification failed:", notifErr);
      // Don't fail the request if notification fails
    }

    return NextResponse.json({ success: true, order_status: newStatus });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
