import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { validateApiAccess } from "@/lib/auth/role-guard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 70;

export async function GET(request: Request) {
  try {
    // 1. Auth + role guard
    const { authorized, response, userId } = await validateApiAccess([
      "admin",
      "shop_owner",
      "manager",
      "staff",
    ]);
    if (!authorized) return response;

    // 2. Rate limit: 200 req / 60s per user
    const { success } = rateLimit(`orders_list_${userId}`, 200, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId")?.trim();
    const status = searchParams.get("status")?.trim().toUpperCase();
    const page = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
    );

    if (!shopId) {
      return NextResponse.json(
        { error: "shopId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 3. Build query — only the fields the client actually needs
    let query = supabase
      .from("orders")
      .select(
        [
          "id",
          "short_token",
          "shop_id",
          "customer_name",
          "customer_phone",
          "file_name",
          "page_count",
          "copies",
          "is_color",
          "is_double_sided",
          "notes",
          "total_amount",
          "status",
          "created_at",
          "updated_at",
          "shops!inner(clerk_owner_id)",
        ].join(", "),
        { count: "estimated" }
      )
      .eq("shop_id", shopId)
      // Row-level ownership: ensures the requesting user owns this shop
      .eq("shops.clerk_owner_id", userId!);

    // Optional status filter
    const VALID_STATUSES = [
      "PLACED",
      "ACCEPTED",
      "PRINTING",
      "READY",
      "COMPLETED",
      "CANCELLED",
      "DRAFT",
    ];
    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq("status", status);
    }

    query = query
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(
        "[GET /api/shop/orders-list] DB error:",
        error.message,
        error.code
      );
      return NextResponse.json(
        { error: "Failed to fetch orders" },
        { status: 500 }
      );
    }

    // 4. Map DB column names → client field names
    const orders = (data ?? []).map((ord) => ({
      id: ord.id,
      short_token: ord.short_token,
      shop_id: ord.shop_id,
      customer_name: ord.customer_name,
      customer_phone: ord.customer_phone,
      file_name: ord.file_name,
      page_count: ord.page_count,
      copies: ord.copies,
      // DB: is_color → client: color
      color: ord.is_color,
      // DB: is_double_sided → client: double_sided
      double_sided: ord.is_double_sided,
      // DB: status → client: order_status
      order_status: ord.status,
      notes: ord.notes,
      total_amount: ord.total_amount,
      created_at: ord.created_at,
      updated_at: ord.updated_at,
    }));

    return NextResponse.json({
      orders,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total: count ?? 0,
        hasMore: (count ?? 0) > page * PAGE_SIZE,
      },
    });
  } catch (err) {
    console.error("[GET /api/shop/orders-list] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
