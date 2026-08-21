import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { validateApiAccess } from "@/lib/auth/role-guard";
import { canManageShop } from "@/lib/auth/shop-access";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderFileRow = {
  id: string;
  scan_status: string | null;
  infected?: boolean | null;
};

type OrderRow = {
  id: string;
  short_token: string;
  shop_id: string;
  customer_name: string;
  customer_phone: string;
  file_name: string;
  page_count: number;
  copies: number;
  is_color: boolean;
  is_double_sided: boolean;
  notes: string | null;
  total_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
  // Embedded one-to-many join from Supabase relational select
  order_files: OrderFileRow[] | null;
};

const VALID_STATUSES = ["PLACED", "ACCEPTED", "PRINTING", "READY", "COMPLETED", "CANCELLED", "DRAFT"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derives the worst file scan status across all files in an order.
 * Priority: infected > scanning > failed > pending > clean
 */
function worstScanStatus(files: OrderFileRow[] | null | undefined): string | null {
  if (!files || files.length === 0) return null;
  const statuses = files.map((f) => f.scan_status ?? "pending");
  if (statuses.includes("infected")) return "infected";
  if (statuses.includes("scanning")) return "scanning";
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("pending")) return "pending";
  return "clean";
}

// Normalize raw DB status values to the uppercase frontend OrderStatus enum.
// The DB may contain lowercase ('new', 'placed', 'accepted', …) from orders
// created after the normalization fix, or uppercase ('PLACED', 'ACCEPTED', …)
// from legacy orders. The frontend type is always uppercase.
function normalizeOrderStatus(raw: string): string {
  const s = raw.trim().toUpperCase();
  // 'NEW' is the normalized DB value for new orders; map it to 'PLACED' (frontend enum)
  if (s === "NEW") return "PLACED";
  return s; // PLACED, ACCEPTED, PRINTING, READY, COMPLETED, CANCELLED, DRAFT
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const start = Date.now();
  const { searchParams } = new URL(request.url);
  const { authorized, response, userId, clerkRole } = await validateApiAccess([
    "admin",
    "shop_owner",
    "manager",
    "staff",
  ]);

  if (!authorized) return response;

  try {

    // 2. Rate limit: 200 req / 60s per user
    const { success } = rateLimit(`orders_list_${userId}`, 200, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const shopId = searchParams.get("shopId")?.trim();
    const statusParam = searchParams.get("status")?.trim().toUpperCase() as ValidStatus | undefined;
    const page = Math.min(200, Math.max(1, parseInt(searchParams.get("page") ?? "1", 10)));

    if (!shopId) {
      return NextResponse.json({ error: "shopId is required" }, { status: 400 });
    }

    // Verify user access to this shop
    // canManageShop has a 30s process-level TTL cache — near-zero cost on warm instances
    const isAuthorized = await canManageShop(userId, shopId, clerkRole);
    if (!isAuthorized) {
      return NextResponse.json({ success: false, error: "Shop not found or access denied" }, { status: 404 });
    }

    const supabase = createAdminClient();

    // ── PERFORMANCE FIX ─────────────────────────────────────────────────────
    // Previous: 2 serial queries (orders → collect IDs → order_files IN (...))
    // Now:      1 relational query with embedded order_files — single round-trip
    //
    // Supabase PostgREST resolves the foreign key order_files(order_id) → orders(id)
    // and returns order_files as a nested array on each order row. This eliminates
    // a ~300ms serial wait for the second query.
    // ────────────────────────────────────────────────────────────────────────
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
          // Embedded join — one DB round-trip total instead of two serial queries
          "order_files(id, scan_status, infected)",
        ].join(", "),
        { count: "estimated" }
      )
      .eq("shop_id", shopId);

    // Optional status filter — PLACED maps to all 'new/pending order' variants.
    // After the status normalization fix, new orders are stored as lowercase 'new'
    // while legacy orders may still have 'PLACED' or 'placed'. We query all variants
    // so both old and new orders appear correctly in the dashboard feed.
    if (statusParam === "PLACED") {
      query = query.in("status", ["PLACED", "placed", "new", "NEW"]);
    } else if (statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)) {
      // For other statuses, match both original case and lowercase
      query = query.in("status", [statusParam, statusParam.toLowerCase()]);
    }

    query = query
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error("[orders-list] DB error:", {
        code: error.code,
        message: error.message,
        hint: error.hint,
        shopId,
        page,
      });
      return NextResponse.json({ success: false, error: "Failed to load orders" }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as OrderRow[];

    // Map DB column names → client field names
    const orders = rows.map((ord) => ({
      id: ord.id,
      short_token: ord.short_token,
      shop_id: ord.shop_id,
      customer_name: ord.customer_name,
      customer_phone: ord.customer_phone,
      file_name: ord.file_name,
      page_count: ord.page_count,
      copies: ord.copies,
      color: ord.is_color,           // DB: is_color       → client: color
      double_sided: ord.is_double_sided, // DB: is_double_sided → client: double_sided
      order_status: normalizeOrderStatus(ord.status), // DB: status → client: order_status (uppercase)
      notes: ord.notes ?? "",
      total_amount: ord.total_amount,
      created_at: ord.created_at,
      updated_at: ord.updated_at,
      // Embedded order_files array — no second query needed
      file_scan_status: worstScanStatus(ord.order_files),
    }));

    if (process.env.NODE_ENV !== "production") {
      console.log(`[PERF] Orders API: ${Date.now() - start} ms (${orders.length} orders, 1 query)`);
    }

    return NextResponse.json({
      success: true,
      orders,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total: count ?? 0,
        hasMore: (count ?? 0) > page * PAGE_SIZE,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[orders-list] Unhandled error:", error.message);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
