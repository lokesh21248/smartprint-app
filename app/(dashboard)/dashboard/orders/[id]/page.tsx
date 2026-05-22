import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { auth } from "@clerk/nextjs/server";
import type { Order } from "@/types";
import { OrderDetailView } from "@/components/orders/OrderDetailView";
import { OrderDetailError } from "@/components/orders/OrderDetailError";

export const metadata: Metadata = { title: "Order Details | SmartPrint" };
export const dynamic = "force-dynamic";

type FetchResult =
  | { ok: true; order: Order }
  | { ok: false; reason: "not-found" | "unauthorized" | "error"; message?: string };

/**
 * Fetch order by UUID.
 *
 * CRITICAL FIX: The orders table is partitioned by created_at.
 * The original query used shops!inner(clerk_owner_id) which can fail on
 * partitioned tables when PostgREST can't resolve the partition boundary.
 *
 * FIX: Split into two separate flat queries:
 *   1. Fetch the order by id (no join)
 *   2. Fetch shop.clerk_owner_id separately by shop_id
 * This avoids the inner join on a partitioned table entirely.
 */
async function fetchOrder(id: string, userId: string): Promise<FetchResult> {
  // Validate id is a proper UUID before hitting DB
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    console.warn(`[orders/${id}] invalid UUID format`);
    return { ok: false, reason: "not-found" };
  }

  try {
    const supabase = createAdminClient();

    // ── Query 1: fetch the order (no JOIN, partitioned-table safe) ────────────
    console.time(`[orders/${id}] db-fetch`);
    const { data: rawData, error } = await supabase
      .from("orders")
      .select(
        "id, short_token, shop_id, customer_name, customer_phone, customer_phone_verified, " +
        "file_s3_key, file_name, page_count, copies, is_color, is_double_sided, notes, " +
        "total_amount, status, status_history, files, created_at, updated_at"
      )
      .eq("id", id)
      .limit(1)
      .maybeSingle();
    console.timeEnd(`[orders/${id}] db-fetch`);

    // Cast through unknown — FlexDatabase uses a loose generic that doesn't
    // infer column types from the select string. This is safe because we
    // validate each field when mapping to the Order type below.
    const raw = rawData as unknown as {
      id: string;
      short_token: string;
      shop_id: string;
      customer_name: string;
      customer_phone: string;
      customer_phone_verified: boolean | null;
      file_s3_key: string;
      file_name: string;
      page_count: number;
      copies: number;
      is_color: boolean;
      is_double_sided: boolean;
      notes: string | null;
      total_amount: number;
      status: string;
      status_history: Array<{ status: string; at?: string; timestamp?: string; actor?: string }> | null;
      files: Array<{ name: string; size: number; pages: number; url: string }> | null;
      created_at: string;
      updated_at: string | null;
    } | null;


    if (error) {
      console.error(`[orders/${id}] DB error:`, error.message, error.code);
      return { ok: false, reason: "error", message: error.message };
    }

    if (!raw) {
      console.warn(`[orders/${id}] order not found in DB`);
      return { ok: false, reason: "not-found" };
    }

    console.log(`[orders/${id}] found order, shop_id=${raw.shop_id}, status=${raw.status}`);

    // ── Query 2: verify shop ownership (separate flat query, no join) ─────────
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("clerk_owner_id")
      .eq("id", raw.shop_id)
      .maybeSingle();

    if (shopError) {
      console.error(`[orders/${id}] shop lookup error:`, shopError.message);
      return { ok: false, reason: "error", message: shopError.message };
    }

    if (!shop) {
      console.warn(`[orders/${id}] shop not found for shop_id=${raw.shop_id}`);
      return { ok: false, reason: "not-found" };
    }

    // Ownership check — shop owner only
    if (shop.clerk_owner_id !== userId) {
      console.warn(`[orders/${id}] unauthorized: userId=${userId} !== owner=${shop.clerk_owner_id}`);
      return { ok: false, reason: "unauthorized" };
    }

    // ── Map DB columns → TypeScript Order type ────────────────────────────────
    const order: Order = {
      id: raw.id,
      short_token: raw.short_token,
      shop_id: raw.shop_id,
      customer_name: raw.customer_name,
      customer_phone: raw.customer_phone,
      customer_phone_verified: raw.customer_phone_verified ?? false,
      file_s3_key: raw.file_s3_key,
      file_name: raw.file_name,
      page_count: raw.page_count,
      copies: raw.copies,
      color: raw.is_color,
      double_sided: raw.is_double_sided,
      notes: raw.notes ?? undefined,
      total_amount: raw.total_amount,
      order_status: raw.status as Order["order_status"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status_history: (raw.status_history || []) as any,
      files: raw.files || [],
      created_at: raw.created_at,
      updated_at: raw.updated_at ?? raw.created_at,
    };


    return { ok: true, order };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[orders/${id}] unexpected error:`, message);
    return { ok: false, reason: "error", message };
  }
}

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { userId } = await auth();

  // Not signed in → redirect to sign-in (middleware should catch this first,
  // but this is a safety net)
  if (!userId) {
    redirect("/login");
  }

  const { id } = params;
  console.log(`[orders/${id}] rendering for userId=${userId}`);

  const result = await fetchOrder(id, userId);

  if (!result.ok) {
    switch (result.reason) {
      case "not-found":
        // Show custom not-found UI (not the raw Next.js 404 page)
        return (
          <OrderDetailError
            title="Order Not Found"
            message="This order doesn't exist or may have been removed."
            backHref="/dashboard/orders"
          />
        );
      case "unauthorized":
        // Order exists but belongs to another shop — don't leak that info
        return (
          <OrderDetailError
            title="Access Denied"
            message="You don't have permission to view this order."
            backHref="/dashboard/orders"
          />
        );
      case "error":
      default:
        // DB/network error — show actionable error with retry
        return (
          <OrderDetailError
            title="Something went wrong"
            message="We couldn't load this order. Please try refreshing the page."
            backHref="/dashboard/orders"
            showRefresh
          />
        );
    }
  }

  return <OrderDetailView order={result.order} />;
}
