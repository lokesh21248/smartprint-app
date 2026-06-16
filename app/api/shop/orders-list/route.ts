import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { validateApiAccess } from "@/lib/auth/role-guard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 70;

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderFileRow = {
  id: string;
  order_id: string;
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
};

const VALID_STATUSES = ["PLACED", "ACCEPTED", "PRINTING", "READY", "COMPLETED", "CANCELLED", "DRAFT"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derives the worst file scan status across all files in an order.
 * Priority: infected > scanning > failed > pending > clean
 */
function worstScanStatus(files: OrderFileRow[] | undefined): string | null {
  if (!files || files.length === 0) return null;
  const statuses = files.map((f) => f.scan_status ?? "pending");
  if (statuses.includes("infected")) return "infected";
  if (statuses.includes("scanning")) return "scanning";
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("pending")) return "pending";
  return "clean";
}

// ── Route Handler ─────────────────────────────────────────────────────────────

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
    const statusParam = searchParams.get("status")?.trim().toUpperCase() as ValidStatus | undefined;
    const page = Math.min(200, Math.max(1, parseInt(searchParams.get("page") ?? "1", 10)));

    if (!shopId) {
      return NextResponse.json({ error: "shopId is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 3. Build query — only the fields the client actually needs.
    //    The shop join enforces row-level ownership: only orders belonging to
    //    a shop owned by the requesting user are returned.
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
      .eq("shops.clerk_owner_id", userId!);

    // Optional status filter — only apply if the value is in the allowlist
    if (statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)) {
      query = query.eq("status", statusParam);
    }

    query = query
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const { data, error, count } = await query;

    if (error) {
      // FIX S9: log full error internally, never expose Supabase internals to client
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
    const orderIds = rows.map((o) => o.id);
    const orderFilesMap: Record<string, OrderFileRow[]> = {};

    // 4. Fetch order_files in a single query using the batch of order IDs
    if (orderIds.length > 0) {
      const { data: filesData, error: filesError } = await supabase
        .from("order_files")
        .select("id, order_id, scan_status, infected")
        .in("order_id", orderIds);

      if (filesError) {
        // Non-fatal: log and continue without file scan status
        console.error("[orders-list] order_files fetch error:", {
          code: filesError.code,
          message: filesError.message,
        });
      } else if (filesData) {
        // FIX R3: replaced the `any` cast with properly typed OrderFileRow
        for (const file of filesData as OrderFileRow[]) {
          if (!orderFilesMap[file.order_id]) {
            orderFilesMap[file.order_id] = [];
          }
          orderFilesMap[file.order_id].push({
            id: file.id,
            order_id: file.order_id,
            scan_status: file.scan_status,
            infected: file.infected,
          });
        }
      }
    }

    // 5. Map DB column names → client field names
    const orders = rows.map((ord) => ({
      id: ord.id,
      short_token: ord.short_token,
      shop_id: ord.shop_id,
      customer_name: ord.customer_name,
      customer_phone: ord.customer_phone,
      file_name: ord.file_name,
      page_count: ord.page_count,
      copies: ord.copies,
      color: ord.is_color, // DB: is_color       → client: color
      double_sided: ord.is_double_sided, // DB: is_double_sided → client: double_sided
      order_status: ord.status, // DB: status         → client: order_status
      notes: ord.notes ?? "",
      total_amount: ord.total_amount,
      created_at: ord.created_at,
      updated_at: ord.updated_at,
      // Aggregated security status — null means no files linked yet
      file_scan_status: worstScanStatus(orderFilesMap[ord.id]),
    }));

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
