import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { OrderCreateSchema } from "@/lib/validators";

// ---------------------------------------------------------------------------
// Shop Pricing Cache — eliminates one DB round-trip per order creation
// TTL: 60 seconds. Shops rarely change pricing mid-session.
// ---------------------------------------------------------------------------
// Shop Pricing Cache — eliminates one DB round-trip per order creation
// TTL: 60 seconds. Shops rarely change pricing mid-session.
// ---------------------------------------------------------------------------
interface PricingEntry {
  price_bw_per_page: number;
  price_color_per_page: number;
  expiresAt: number;
}
const pricingCache = new Map<string, PricingEntry>();
const PRICING_TTL_MS = 60 * 1000; // 60 seconds

async function getShopPricing(
  shopId: string
): Promise<{ price_bw_per_page: number; price_color_per_page: number } | null> {
  const now = Date.now();
  const cached = pricingCache.get(shopId);
  if (cached && cached.expiresAt > now) {
    return { price_bw_per_page: cached.price_bw_per_page, price_color_per_page: cached.price_color_per_page };
  }

   const supabase = createAdminClient();
   const { data: shop, error } = await supabase
     .from("shops")
     .select("price_bw_per_page, price_color_per_page, is_active")
     .eq("id", shopId)
     .single();

  if (error || !shop) return null;
  if (!shop.is_active) return null; // Block orders for inactive shops

  const entry: PricingEntry = {
    price_bw_per_page: shop.price_bw_per_page ?? 0,
    price_color_per_page: shop.price_color_per_page ?? 0,
    expiresAt: now + PRICING_TTL_MS,
  };
  pricingCache.set(shopId, entry);
  return entry;
}

/**
 * POST /api/orders — Create a new order (public/guest endpoint)
 *
 * ⚠️  WAL NOTE: One INSERT per order. Never loops or batches here.
 * If bulk-order support is added in future, use a single multi-row INSERT,
 * not multiple sequential .insert() calls.
 *
 * ⚠️  PARTITION NOTE: INSERT routes to the correct month partition automatically
 * via the `created_at` range constraint defined in CLERK_SCHEMA.sql.
 * Ensure future month partitions exist (run Section 7 of PRODUCTION_MAINTENANCE.sql monthly).
 */
export async function POST(request: Request) {
  try {
    // Initialize Supabase admin client (fresh instance per request)
    const supabase = createAdminClient();

    // 1. Rate Limiting — in-memory, zero DB overhead
    const ip = request.headers.get("x-forwarded-for") || "anonymous";
    const { success, remaining } = rateLimit(`order_spam_${ip}`, 5, 3600);

    if (!success) {
      return NextResponse.json(
        { error: "Too many orders from this IP. Please try again in an hour." },
        { status: 429 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // ─── Zod Validation (single source of truth for all input constraints) ────
    const parsed = OrderCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      shopId,
      filePath,
      fileName,
      pageCount,
      copies,
      color,
      doubleSided,
      notes,
      customerName,
      customerPhone,
      fileSize = 1024,
      files = [],
    } = parsed.data;

    // ─── Duplicate Detection ─────────────────────────────────────────────────
    // Prevent double-submission: same phone + file name to same shop within 5 minutes.
    if (fileName) {
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("id, short_token")
        .eq("shop_id", shopId)
        .eq("customer_phone", customerPhone)
        .eq("file_name", fileName)
        .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .not("status", "in", "(CANCELLED,DRAFT)")
        .limit(1)
        .maybeSingle();

      if (existingOrder) {
        console.warn("[POST /api/orders] Duplicate order detected, returning existing:", existingOrder.id);
        return NextResponse.json({
          success: true,
          orderId: existingOrder.id,
          shortToken: existingOrder.short_token,
          duplicate: true,
        });
      }
    }

    // ─── Pricing ─────────────────────────────────────────────────────────────
    // Fetch shop pricing via cache (server-side calculation, cache TTL: 60s)
    const shopPricing = await getShopPricing(shopId);
    if (!shopPricing) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    // Calculate total amount (server-side for security)
    const pricePerPage = color
      ? shopPricing.price_color_per_page
      : shopPricing.price_bw_per_page;
    const totalAmount = pageCount * copies * pricePerPage;

    // Guard: never allow a zero-amount order (misconfigured shop pricing)
    if (totalAmount <= 0) {
      return NextResponse.json({ error: "Shop pricing is not configured" }, { status: 422 });
    }

    // Create order using service role to bypass RLS and insert directly as PLACED
    const { data, error } = await supabase
      .from("orders")
      .insert({
        shop_id: shopId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_ip: ip,
        file_s3_key: files.length > 0 ? files[0].url : filePath!,
        file_name: files.length > 0 ? files[0].name : fileName!,
        file_size_bytes: files.length > 0 ? files[0].size : fileSize,
        files: files.length > 0 ? files : [
          { name: fileName, size: fileSize, pages: pageCount, url: filePath }
        ],
        page_count: pageCount,
        copies: copies,
        is_color: !!color,           // schema column: is_color
        is_double_sided: !!doubleSided, // schema column: is_double_sided
        notes: notes || null,
        total_amount: totalAmount,
        status: "PLACED",            // schema column: status
      })
      .select("id, short_token, customer_name, total_amount, shops(clerk_owner_id)")
      .single();

    if (error) {
      console.error("[POST /api/orders] ❌ Insert Error:", error);
      // Handle DB-level unique constraint violation gracefully (Idempotency)
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("orders")
          .select("id, short_token")
          .eq("shop_id", shopId)
          .eq("customer_phone", customerPhone)
          .eq("file_name", fileName)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return NextResponse.json(
          { 
            error: "Duplicate order detected.",
            success: true, // Mark as success for the client to proceed to tracking
            orderId: existing?.id,
            shortToken: existing?.short_token,
            duplicate: true 
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // ─── Post-Insert Logic ───────────────────────────────────────────────────

    // Trigger owner notification
    const shopData = data.shops as unknown as Record<string, unknown>;
    if (shopData?.clerk_owner_id) {
      const { NotificationService } = await import("@/lib/notifications");
      await NotificationService.alertNewOrder(shopData.clerk_owner_id as string, {
        customer_name: data.customer_name,
        total_amount: data.total_amount,
      });
    }

    return NextResponse.json({
      success: true,
      orderId: data.id,
      shortToken: data.short_token,
      totalAmount,
    });
  } catch (err) {
    console.error("[POST /api/orders]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orders?shortToken=ABC12345
 * Fetch order details for guest tracking
 */
export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const shortToken = searchParams.get("shortToken");

    if (!shortToken) {
      return NextResponse.json(
        { error: "shortToken required" },
        { status: 400 }
      );
    }

    // Call the RPC function defined in PRODUCTION_SCHEMA.sql
    const { data, error } = await supabase.rpc('get_order_by_token', { 
      p_token: shortToken 
    });

    if (error || !data || !data.success) {
      console.warn(`[GET /api/orders] ❌ Order not found or error:`, error?.message || data?.error);
      return NextResponse.json({ error: data?.error || "Order not found" }, { status: 404 });
    }

    // Map RPC response → Order type
    const mappedOrder = {
      short_token: shortToken,
      customer_name: data.customer_name,
      page_count: data.page_count,
      copies: data.copies,
      color: data.is_color,           // RPC returns is_color from DB
      double_sided: data.is_double_sided, // RPC returns is_double_sided from DB
      total_amount: data.total_amount,
      order_status: data.status,      // RPC returns status from DB → map to type field
      shops: {
        name: data.shop_name,
        address_line1: data.shop_address,
        phone: data.shop_phone,
      }
    };

    // Cache-Control: terminal orders are immutable
    const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "REJECTED"];
    const isTerminal = TERMINAL_STATUSES.includes(data.status as string); // data.status = live DB field
    const cacheHeader = isTerminal
      ? "public, s-maxage=86400, immutable"          // 24h — status will never change
      : "public, s-maxage=10, stale-while-revalidate=30"; // 10s CDN, refresh in bg

    return NextResponse.json(mappedOrder, {
      headers: { "Cache-Control": cacheHeader },
    });
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
