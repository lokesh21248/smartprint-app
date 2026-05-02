import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role for guest order creation
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/orders
 * Create a new order (guest endpoint)
 * Body: {
 *   shopId: UUID
 *   filePath: string (from storage)
 *   fileName: string
 *   pageCount: number
 *   copies: number
 *   color: boolean
 *   doubleSided: boolean
 *   notes: string (optional)
 *   customerName: string
 *   customerPhone: string
 * }
 */
import { rateLimit } from "@/lib/ratelimit";

/**
 * POST /api/orders
 * Create a new order (guest endpoint)
 */
export async function POST(request: Request) {
  try {
    // 1. Rate Limiting (Prevent spam)
    const ip = request.headers.get("x-forwarded-for") || "anonymous";
    const { success, remaining } = await rateLimit(`order_spam_${ip}`, 5, 3600);

    if (!success) {
      return NextResponse.json(
        { error: "Too many orders from this IP. Please try again in an hour." },
        { status: 429 }
      );
    }

    const body = await request.json();
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
      fileSize = 1024, // Provide a default for existing clients
    } = body;

    // Validate inputs
    if (
      !shopId ||
      !filePath ||
      !pageCount ||
      !copies ||
      customerName === undefined ||
      customerPhone === undefined
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate copies
    if (copies < 1 || copies > 50) {
      return NextResponse.json(
        { error: "Copies must be between 1 and 50" },
        { status: 400 }
      );
    }

    // Fetch shop pricing (server-side calculation)
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("price_bw_per_page, price_color_per_page")
      .eq("id", shopId)
      .single();

    if (shopError || !shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    // Calculate total amount (server-side for security)
    const pricePerPage = color
      ? shop.price_color_per_page
      : shop.price_bw_per_page;
    const totalAmount = pageCount * copies * pricePerPage;

    // Create order using service role to bypass RLS and insert directly as PLACED
    const { data, error } = await supabase
      .from("orders")
      .insert({
        shop_id: shopId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_ip: ip,
        file_s3_key: filePath,
        file_name: fileName,
        file_size_bytes: fileSize,
        page_count: pageCount,
        copies: copies,
        is_color: !!color,
        is_double_sided: !!doubleSided,
        notes: notes || null,
        total_amount: totalAmount,
        status: "PLACED",
      })
      .select("id, short_token, customer_name, total_amount, shops(owner_id)")
      .single();

    if (error) {
      console.error("[POST /api/orders] ❌ Insert Error:", error);
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    console.log("[POST /api/orders] ✅ Insert Success:", data);

    // Trigger owner notification
    const shopData = data.shops as Record<string, unknown>;
    if (shopData?.owner_id) {
      const { NotificationService } = await import("@/lib/notifications");
      await NotificationService.alertNewOrder(shopData.owner_id, {
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

    console.log(`[GET /api/orders] ✅ Fetch Success for ${shortToken}:`, data);

    // Map RPC response back to the format the frontend expects
    const mappedOrder = {
      short_token: shortToken,
      customer_name: data.customer_name,
      page_count: data.page_count,
      copies: data.copies,
      color: data.is_color,
      double_sided: data.is_double_sided,
      total_amount: data.total_amount,
      order_status: data.status,
      shops: {
        name: data.shop_name,
        address: data.shop_address,
        phone: data.shop_phone,
      }
    };

    return NextResponse.json(mappedOrder);
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
