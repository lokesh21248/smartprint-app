import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitOrders, rateLimitOrdersGet, rateLimitHeaders } from "@/lib/ratelimit";
import { OrderCreateSchema } from "@/lib/validators";
import { enqueueBackgroundTasks } from "@/lib/queue/background-tasks";
import { getClientIp } from "@/lib/utils/ip";
import { redisGet, redisSet } from "@/lib/redis";
import { invalidateShopPricingCache } from "@/lib/cache/pricing";

// ─── Runtime Config ──────────────────────────────────────────────────────────
// Node.js runtime: required for Supabase client (uses Node crypto internals).
// maxDuration 30s: orders should never need more. If they do, the bottleneck
// is in the DB, not the application — investigate indexes first.
export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

// ─── In-memory Idempotency Cache ─────────────────────────────────────────────
// Prevents duplicate orders from rapid double-taps or frontend retries.
// Key: idempotency key from X-Idempotency-Key header (or derived from payload).
// Value: { orderId, shortToken, expiresAt }
// TTL: 5 minutes — enough to cover any realistic retry window.
// Note: This is per-instance; across Vercel instances the DB unique constraint
//       provides the second layer of protection.
interface IdempotencyEntry {
  orderId: string;
  shortToken: string;
  totalAmount: number;
  expiresAt: number;
}
const idempotencyCache = new Map<string, IdempotencyEntry>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

function getIdempotencyEntry(key: string): IdempotencyEntry | null {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    idempotencyCache.delete(key);
    return null;
  }
  return entry;
}

function setIdempotencyEntry(key: string, value: Omit<IdempotencyEntry, "expiresAt">): void {
  // Evict expired entries every ~100 inserts to prevent unbounded growth
  if (idempotencyCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of idempotencyCache) {
      if (v.expiresAt < now) idempotencyCache.delete(k);
    }
  }
  idempotencyCache.set(key, { ...value, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
}

// ─── Shop Pricing Cache ───────────────────────────────────────────────────────
// Primary:  Redis (shared across Vercel instances, invalidated on shop update)
// Fallback: In-memory Map (per-instance, used when Redis env vars not set)
// TTL: 60 seconds. Shops rarely change pricing mid-session.
import { pricingCacheMap, PricingEntry } from "@/lib/cache/pricing";
const PRICING_TTL_MS = 60 * 1000;
const PRICING_TTL_S  = 60;

async function getShopPricing(
  shopId: string
): Promise<{ price_bw_per_page: number; price_color_per_page: number; clerk_owner_id: string | null } | null> {
  const redisCacheKey = `pricing:${shopId}`;

  // 1. Try Redis first (shared cache, invalidation-safe)
  const redisHit = await redisGet<PricingEntry>(redisCacheKey);
  if (redisHit) {
    return {
      price_bw_per_page:   redisHit.price_bw_per_page,
      price_color_per_page: redisHit.price_color_per_page,
      clerk_owner_id:      redisHit.clerk_owner_id,
    };
  }

  // 2. Fall back to per-instance Map
  const now = Date.now();
  const cached = pricingCacheMap.get(shopId);
  if (cached && cached.expiresAt > now) {
    return {
      price_bw_per_page:   cached.price_bw_per_page,
      price_color_per_page: cached.price_color_per_page,
      clerk_owner_id:      cached.clerk_owner_id,
    };
  }

  // 3. DB fetch — single flat query (no JOIN)
  const supabase = createAdminClient();
  const { data: shop, error } = await supabase
    .from("shops")
    .select("price_bw_per_page, price_color_per_page, is_active, clerk_owner_id")
    .eq("id", shopId)
    .single();

  if (error || !shop) return null;
  if (!shop.is_active) return null;

  const entry = {
    price_bw_per_page:   shop.price_bw_per_page ?? 0,
    price_color_per_page: shop.price_color_per_page ?? 0,
    clerk_owner_id:      shop.clerk_owner_id ?? null,
    expiresAt:           now + PRICING_TTL_MS,
  };

  // Write to both caches
  pricingCacheMap.set(shopId, entry);
  void redisSet(redisCacheKey, entry, PRICING_TTL_S);

  return {
    price_bw_per_page:   entry.price_bw_per_page,
    price_color_per_page: entry.price_color_per_page,
    clerk_owner_id:      entry.clerk_owner_id,
  };
}



/**
 * POST /api/orders — Create a new print order (public/guest endpoint)
 *
 * OPTIMIZED FLOW:
 * 1. Rate limit check (in-memory, zero DB cost)
 * 2. Idempotency check (in-memory, zero DB cost)
 * 3. Validate + sanitize input (zero DB cost)
 * 4. Duplicate detection (1 DB read, indexed)
 * 5. Pricing lookup (cached, usually 0 DB cost)
 * 6. Single flat INSERT — NO JOIN (1 DB write, ~20ms)
 * 7. Return 200 immediately
 * 8. [Background] Notification insert (decoupled, never blocks response)
 *
 * ⚠️ WAL NOTE: One INSERT per order. Never loops or batches here.
 * ⚠️ PARTITION NOTE: INSERT routes to correct month partition automatically.
 */
export async function POST(request: Request) {
  console.time("[orders:POST:total]");

  try {
    const { userId } = await auth();
    const supabase = createAdminClient();

    // ── 1. Rate Limiting ──────────────────────────────────────────────────────
    const ip = getClientIp(request);
    const rl = rateLimitOrders(ip);
    if (!rl.success) {
      console.timeEnd("[orders:POST:total]");
      return NextResponse.json(
        { error: "Too many requests. Please slow down and try again shortly." },
        { status: 429, headers: rateLimitHeaders(rl, rl.limit) }
      );
    }

    // ── 2. Idempotency Key Check ──────────────────────────────────────────────
    const idempotencyKey = request.headers.get("x-idempotency-key");
    if (idempotencyKey) {
      const existing = getIdempotencyEntry(idempotencyKey);
      if (existing) {
        console.log("[orders:POST] idempotency hit — returning cached response");
        console.timeEnd("[orders:POST:total]");
        return NextResponse.json({
          success: true,
          orderId: existing.orderId,
          shortToken: existing.shortToken,
          totalAmount: existing.totalAmount,
          duplicate: true,
        });
      }
    }

    // ── 3. Parse + Validate Body ──────────────────────────────────────────────
    let rawBody;
    try {
      rawBody = await request.json();
    } catch (err) {
      console.error("[orders:POST] JSON parse error:", err);
      console.timeEnd("[orders:POST:total]");
      return NextResponse.json(
        { success: false, error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    // Backend phone sanitization (defense-in-depth beyond Zod)
    const phone = String(rawBody.customerPhone || "").replace(/\D/g, "");
    const cleanPhone = phone.length >= 10 ? phone.slice(-10) : phone;
    if (!/^\d{10}$/.test(cleanPhone)) {
      console.timeEnd("[orders:POST:total]");
      return NextResponse.json(
        { error: "Invalid phone number. Must be 10 digits." },
        { status: 400 }
      );
    }
    rawBody.customerPhone = cleanPhone;

    const parsed = OrderCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errorDetails = parsed.error.flatten();
      console.timeEnd("[orders:POST:total]");
      return NextResponse.json(
        {
          error: "Validation failed",
          details: errorDetails.fieldErrors,
          message:
            Object.values(errorDetails.fieldErrors).flat()[0] ||
            "Invalid order details",
        },
        { status: 400 }
      );
    }

    const {
      id,
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

    // Debug log: only in development — avoid leaking order payload to production logs
    if (process.env.NODE_ENV !== "production") {
      console.log("[orders:POST] Incoming order payload:", JSON.stringify({
        copies,
        color,
        doubleSided,
        filesCount: files?.length ?? 0,
        filesCopies: files?.map(f => ({ name: f.name, copies: f.copies, color: f.color })),
      }));
    }

    // ── 3.5. Security: Block Invalid Types ─────────
    if (files && files.length > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.log("FILE SECURITY CHECK", files.map(f => ({
          name: f.name,
          scanStatus: f.scanStatus,
          securityStatus: f.securityStatus
        })));
      }

      const hasInvalidType = files.some(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return !['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext || '');
      });

      if (hasInvalidType) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "checkout_blocked_invalid_type",
          shop_id: shopId,
          user_id: userId,
          ip: ip,
          timestamp: new Date().toISOString()
        }));
        console.timeEnd("[orders:POST:total]");
        return NextResponse.json(
          { error: "Invalid file type. Only PDF, JPG, and PNG are allowed." },
          { status: 400 }
        );
      }
    }

    // ── 4+5. Duplicate Detection + Pricing (parallelized) ──────────────────────
    // Run both in parallel — saves ~200-300ms vs sequential on mobile networks.
    console.time("[orders:POST:dedup+pricing]");
    const dedupeFileName = files.length > 0 ? files[0].name : (fileName ?? null);
    const [dedupResult, shopPricing] = await Promise.all([
      // Dedup check (covered by composite index: idx_orders_dedup)
      dedupeFileName
        ? supabase
            .from("orders")
            .select("id, short_token")
            .eq("shop_id", shopId)
            .eq("customer_phone", customerPhone)
            .eq("file_name", dedupeFileName)
            .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
            .not("status", "in", "(CANCELLED,DRAFT)")
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // Pricing lookup (cached, usually 0 DB cost after first request)
      getShopPricing(shopId),
    ]);
    console.timeEnd("[orders:POST:dedup+pricing]");

    const existingOrder = dedupResult.data;
    if (existingOrder) {
      console.timeEnd("[orders:POST:total]");
      return NextResponse.json({
        success: true,
        orderId: existingOrder.id,
        shortToken: existingOrder.short_token,
        duplicate: true,
      });
    }

    if (!shopPricing) {
      console.timeEnd("[orders:POST:total]");
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    // Support pricing for mixed multiple files or single file
    let totalAmount = 0;
    if (files.length > 0) {
      for (const f of files) {
        const filePricePerPage = f.color
          ? shopPricing.price_color_per_page
          : shopPricing.price_bw_per_page;
        totalAmount += f.pages * f.copies * filePricePerPage;
      }
    } else {
      const pricePerPage = color
        ? shopPricing.price_color_per_page
        : shopPricing.price_bw_per_page;
      totalAmount = pageCount * copies * pricePerPage;
    }

    if (totalAmount <= 0) {
      console.timeEnd("[orders:POST:total]");
      return NextResponse.json(
        { error: "Shop pricing is not configured or total amount is zero" },
        { status: 422 }
      );
    }

    // ── 6. Single Flat INSERT — NO JOIN ───────────────────────────────────────
    // clerk_owner_id is already in the pricing cache above.
    const firstFile = files.length > 0 ? files[0] : null;
    const orderInsertPayload = {
      ...(id ? { id } : {}),
      shop_id: shopId,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_ip: ip,
      file_s3_key: firstFile ? firstFile.url : filePath!,
      file_name: firstFile ? firstFile.name : fileName!,
      file_size_bytes: firstFile ? firstFile.size : fileSize,
      files:
        files.length > 0
          ? files
          : [{ name: fileName, size: fileSize, pages: pageCount, url: filePath, copies, color, doubleSided }],
      page_count: Number(firstFile ? (firstFile.pages || 1) : (pageCount || 1)),
      copies: Number(firstFile ? (firstFile.copies ?? 1) : (copies || 1)),
      is_color: Boolean(firstFile ? (firstFile.color ?? false) : (color ?? false)),
      is_double_sided: Boolean(firstFile ? (firstFile.doubleSided ?? false) : (doubleSided ?? false)),
      notes: String(notes || "").trim(),
      total_amount: Number(totalAmount || 0),
      status: "PLACED",
    };

    console.time("[orders:POST:insert]");
    const { data, error } = await supabase
      .from("orders")
      .insert(orderInsertPayload)
      .select("id, short_token, customer_name, total_amount")
      .single();
    console.timeEnd("[orders:POST:insert]");

    if (error) {
      console.error("[orders:POST] INSERT ERROR:", {
        message: error.message,
        details: error.details,
        code: error.code,
      });

      // DB-level unique constraint — idempotent fallback
      if (error.code === "23505") {
        let existing = null;
        if (id) {
          const { data } = await supabase
            .from("orders")
            .select("id, short_token")
            .eq("id", id)
            .maybeSingle();
          existing = data;
        }

        if (!existing) {
          const { data } = await supabase
            .from("orders")
            .select("id, short_token")
            .eq("shop_id", shopId)
            .eq("customer_phone", customerPhone)
            .eq("file_name", fileName || (firstFile ? firstFile.name : ""))
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          existing = data;
        }

        console.timeEnd("[orders:POST:total]");
        return NextResponse.json(
          {
            success: true,
            orderId: existing?.id,
            shortToken: existing?.short_token,
            totalAmount,
            duplicate: true,
          },
          { status: 200 }
        );
      }

      console.timeEnd("[orders:POST:total]");
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error.details,
          code: error.code,
        },
        { status: 500 }
      );
    }

    // ── 7. Cache idempotency result ──────────────────────────────────────────────────
    if (idempotencyKey) {
      setIdempotencyEntry(idempotencyKey, {
        orderId: data.id,
        shortToken: data.short_token,
        totalAmount,
      });
    }

    // ── 8. Fire-and-forget background tasks (child file rows + notifications) ────────
    // None of these need to complete before the client gets the 200.
    // The order is already saved — we just need to write the relational rows.
    const clerkOwnerId = shopPricing.clerk_owner_id;
    const bgFilesToInsert = files.length > 0
      ? files
      : [{ name: fileName!, url: filePath!, size: fileSize, pages: pageCount, mimeType: "application/pdf" }];
    const bgOrderFilesPayload = bgFilesToInsert.map((f) => ({
      order_id: data.id,
      shop_id: shopId,
      uploaded_by: userId || null,
      file_name: f.name,
      storage_path: f.url,
      file_size: f.size,
      page_count: f.pages,
      copies: Number((f as { copies?: number }).copies ?? 1),
      is_color: Boolean((f as { color?: boolean }).color ?? false),
      is_double_sided: Boolean((f as { doubleSided?: boolean }).doubleSided ?? false),
      mime_type: f.mimeType || (f.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      scan_status: "pending",
      security_status: "pending",
      infected: false,
    }));
    const bgStoragePaths = bgOrderFilesPayload.map((f) => f.storage_path);

    enqueueBackgroundTasks("order-placed", [
      {
        name: "write-order-files",
        fn: async () => {
          // Link staging uploads + write child file rows in parallel
          await Promise.all([
            supabase
              .from("upload_sessions")
              .update({ order_id: data.id, is_temporary: false })
              .in("storage_path", bgStoragePaths)
              .then(({ error }) => {
                if (error) console.warn("[orders:POST] upload_sessions link failed:", error.message);
              }),
            supabase
              .from("uploaded_files")
              .update({ order_id: data.id })
              .in("storage_path", bgStoragePaths)
              .then(({ error }) => {
                if (error) console.warn("[orders:POST] uploaded_files update skipped:", error.message);
              }),
            supabase
              .from("order_files")
              .insert(bgOrderFilesPayload)
              .then(({ error }) => {
                if (error) console.error("[orders:POST] order_files insert failed (non-fatal):", error.message);
              }),
          ]);
        },
      },
      ...(clerkOwnerId
        ? [
            {
              name: "notify-owner",
              fn: async () => {
                const { NotificationService } = await import("@/lib/notifications");
                NotificationService.alertNewOrder(clerkOwnerId, {
                  customer_name: data.customer_name,
                  total_amount: data.total_amount,
                });
              },
            },
          ]
        : []),
      {
        name: "log-order-placed",
        fn: async () => {
          console.log(JSON.stringify({
            level: "info",
            event: "order_placed",
            order_id: data.id,
            shop_id: shopId,
            user_id: userId,
            amount: totalAmount,
            ip: ip,
            timestamp: new Date().toISOString()
          }));
        },
      },
    ]);

    console.timeEnd("[orders:POST:total]");

    // ── 9. Instant success response ───────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      orderId: data.id,
      shortToken: data.short_token,
      totalAmount,
    });
  } catch (err) {
    console.error("[orders:POST] Unexpected error:", err);
    console.timeEnd("[orders:POST:total]");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── GET /api/orders?shortToken=... ──────────────────────────────────────────

interface GetOrderByTokenResponse {
  success: boolean;
  error?: string;
  customer_name: string;
  page_count: number;
  copies: number;
  is_color: boolean;
  is_double_sided: boolean;
  total_amount: number;
  status: string;
  shop_name: string;
  shop_address: string;
  shop_phone: string;
}

/**
 * GET /api/orders?shortToken=ABC12345
 * Fetch order details for guest tracking.
 */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimitOrdersGet(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: rateLimitHeaders(rl, rl.limit) }
      );
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const shortToken = searchParams.get("shortToken");

    if (!shortToken) {
      return NextResponse.json({ error: "shortToken required" }, { status: 400 });
    }

    // ── Parallelise: RPC + raw order fetch run simultaneously ─────────────────
    const [rpcResult, rawResult] = await Promise.all([
      supabase.rpc("get_order_by_token", { p_token: shortToken }) as unknown as Promise<{
        data: GetOrderByTokenResponse | null;
        error: unknown;
      }>,
      supabase
        .from("orders")
        .select("id, shop_id, files, notes")
        .eq("short_token", shortToken)
        .maybeSingle(),
    ]);

    const { data, error } = rpcResult;
    const { data: rawOrder } = rawResult;

    if (error || !data || !data.success) {
      console.warn(
        "[orders:GET] not found:",
        (error as Error)?.message || data?.error
      );
      return NextResponse.json(
        { error: data?.error || "Order not found" },
        { status: 404 }
      );
    }

    const mappedOrder = {
      id: rawOrder?.id || null,
      shop_id: rawOrder?.shop_id || null,
      short_token: shortToken,
      customer_name: data.customer_name,
      page_count: data.page_count,
      copies: data.copies,
      color: data.is_color,
      double_sided: data.is_double_sided,
      total_amount: data.total_amount,
      order_status: data.status,
      notes: rawOrder?.notes || null,
      files: rawOrder?.files || null,
      shops: {
        name: data.shop_name,
        address_line1: data.shop_address,
        phone: data.shop_phone,
      },
    };

    const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "REJECTED"];
    const isTerminal = TERMINAL_STATUSES.includes(data.status as string);
    const cacheHeader = isTerminal
      ? "public, s-maxage=86400, immutable"
      : "public, s-maxage=10, stale-while-revalidate=30";

    return NextResponse.json(mappedOrder, {
      headers: { "Cache-Control": cacheHeader },
    });
  } catch (err) {
    console.error("[orders:GET] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
