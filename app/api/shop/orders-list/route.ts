import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { validateApiAccess } from "@/lib/auth/role-guard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 70;

export async function GET(request: Request) {
  try {
    // 0. Verify required environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      console.error("Orders API Error: Missing database environment variables.");
      return NextResponse.json(
        {
          success: false,
          error: "Database environment variables are not configured.",
          details: { supabaseUrl: !!supabaseUrl, supabaseAnonKey: !!supabaseAnonKey, serviceRoleKey: !!serviceRoleKey }
        },
        { status: 500 }
      );
    }

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

    // 3. Build query — only the fields the client actually needs.
    //    We do NOT join order_files here because there is no foreign key relation
    //    defined in PostgREST's schema cache. Instead, we query it separately in memory.
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
      console.error("Orders API Error:", error);
      console.error("Request Params:", { status, page });
      console.error("Shop ID:", shopId);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error
        },
        { status: 500 }
      );
    }

    // 4. Map DB column names → client field names
    type OrderFileRow = {
      id: string;
      scan_status: string | null;
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

    // Query order_files separately in memory using fetched order IDs
    const rows = (data ?? []) as unknown as OrderRow[];
    const orderIds = rows.map((o) => o.id);
    const orderFilesMap: Record<string, OrderFileRow[]> = {};

    if (orderIds.length > 0) {
      const { data: filesData, error: filesError } = await supabase
        .from("order_files")
        .select("id, order_id, scan_status")
        .in("order_id", orderIds);

      if (filesError) {
        console.error("Orders API Error: Failed to fetch related order files", filesError);
      } else if (filesData) {
        filesData.forEach((file: any) => {
          if (!orderFilesMap[file.order_id]) {
            orderFilesMap[file.order_id] = [];
          }
          orderFilesMap[file.order_id].push({
            id: file.id,
            scan_status: file.scan_status,
            infected: file.infected,
          });
        });
      }
    }

    // Derive the worst file_scan_status across all files in the order.
    // Priority: infected > scanning > failed > pending > clean
    const worstScanStatus = (
      files: OrderFileRow[] | undefined
    ): string | null => {
      if (!files || files.length === 0) return null;
      const statuses = files.map((f) => f.scan_status ?? "pending");
      if (statuses.includes("infected")) return "infected";
      if (statuses.includes("scanning")) return "scanning";
      if (statuses.includes("failed")) return "failed";
      if (statuses.includes("pending")) return "pending";
      return "clean";
    };

    const orders = rows.map((ord) => ({
      id: ord.id,
      short_token: ord.short_token,
      shop_id: ord.shop_id,
      customer_name: ord.customer_name,
      customer_phone: ord.customer_phone,
      file_name: ord.file_name,
      page_count: ord.page_count,
      copies: ord.copies,
      color: ord.is_color,              // DB: is_color      → client: color
      double_sided: ord.is_double_sided, // DB: is_double_sided → client: double_sided
      order_status: ord.status,          // DB: status        → client: order_status
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
    console.error("Orders API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: error
      },
      { status: 500 }
    );
  }
}
