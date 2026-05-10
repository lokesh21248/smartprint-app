import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/shop/orders-list?shopId=<uuid>&status=<status>&page=<n>
 *
 * Authenticated endpoint — shop owners only.
 * Returns paginated orders for the shop with correct column mapping.
 *
 * Why this exists instead of direct browser Supabase access:
 * - DB columns are is_color, is_double_sided, status (not color, double_sided, order_status)
 * - RLS is not configured for Clerk auth — admin client is required
 * - Keeps DB schema hidden from browser network tab
 */

const PAGE_SIZE = 50; // orders per page — enough for one screen, efficient for DB

export async function GET(request: Request) {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Rate limit keyed by userId (200 req/min — dashboard polls every 30s)
    const { success } = rateLimit(`orders_list_${userId}`, 200, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // 3. Parse params
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId")?.trim();
    const status = searchParams.get("status")?.trim().toUpperCase(); // optional filter
    // Cap page to prevent runaway offset scans (page 1000 → offset 50000 rows)
    const page = Math.min(200, Math.max(1, parseInt(searchParams.get("page") ?? "1", 10)));

    if (!shopId) {
      return NextResponse.json({ error: "shopId is required" }, { status: 400 });
    }

    // Validate shopId is UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId)) {
      return NextResponse.json({ error: "Invalid shopId" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Ownership is verified securely in the main query via an INNER JOIN on shops!inner

    // 5. Build query — select only needed columns, map DB → type names
    //
    // ⚠️  WAL NOTE: This is READ-ONLY. No writes here.
    // Do NOT add UPDATE calls inside this list endpoint — use PATCH /api/orders/[id]/status.
    //
    // ⚠️  PARTITION NOTE: The .eq("shop_id") + .order("created_at", DESC) combo
    // hits idx_orders_shop_id_status_created_at (multi-column index) on each partition.
    // PostgreSQL partition pruning kicks in automatically when created_at range is also filtered.
    // Adding .gte("created_at", ...) further reduces partition scans for date-filtered views.
    let query = supabase
      .from("orders")
      .select(
        "id, short_token, customer_name, customer_phone, file_name, page_count, copies, is_color, is_double_sided, notes, total_amount, status, status_history, created_at, updated_at, shops!inner(clerk_owner_id)",
        { count: "estimated" }
      )
      .eq("shop_id", shopId)
      .eq("shops.clerk_owner_id", userId);

    // Apply status filter BEFORE ordering and ranging
    // (Supabase builds query lazily — filter order affects WHERE clause correctness)
    const VALID_STATUSES = ["PLACED", "ACCEPTED", "PRINTING", "READY", "COMPLETED", "CANCELLED", "DRAFT"];
    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq("status", status);
    }

    // Apply ORDER + PAGINATION last
    query = query
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error("[GET /api/shop/orders-list] DB error:", error);
      return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
    }

    // 6. Map DB column names → TypeScript Order type field names
    const orders = (data ?? []).map((ord) => ({
      id: ord.id as string,
      short_token: ord.short_token as string,
      customer_name: ord.customer_name as string,
      customer_phone: ord.customer_phone as string,
      file_name: (ord.file_name as string) || undefined,
      page_count: (ord.page_count as number) || 0,
      copies: (ord.copies as number) || 1,
      // ─── DB → type mapping ───────────────────────────────────────────────────
      color: (ord.is_color as boolean) || false,           // DB: is_color
      double_sided: (ord.is_double_sided as boolean) || false, // DB: is_double_sided
      order_status: ord.status as string,                  // DB: status
      // ────────────────────────────────────────────────────────────────────────
      notes: (ord.notes as string) || undefined,
      total_amount: ord.total_amount as number,
      status_history: (ord.status_history as unknown[]) || [],
      created_at: ord.created_at as string,
      updated_at: ord.updated_at as string,
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
    console.error("[GET /api/shop/orders-list]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
