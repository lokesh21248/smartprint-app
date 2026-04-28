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
export async function POST(request: Request) {
  try {
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

    // Generate short token (8 chars, alphanumeric)
    const shortToken = Math.random()
      .toString(36)
      .substring(2, 10)
      .toUpperCase();

    // Create order
    const { data, error } = await supabase
      .from("orders")
      .insert({
        short_token: shortToken,
        shop_id: shopId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_phone_verified: false,
        file_s3_key: filePath,
        file_name: fileName,
        page_count: pageCount,
        copies,
        color,
        double_sided: doubleSided,
        notes: notes || null,
        total_amount: totalAmount,
        order_status: "PLACED",
        scan_status: "PENDING",
        status_history: [
          {
            status: "PLACED",
            at: new Date().toISOString(),
            actor: "system",
          },
        ],
      })
      .select("id, customer_name, total_amount, shops(owner_id)")
      .single();

    if (error) {
      console.error("[POST /api/orders] Error:", error);
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // Trigger owner notification
    const shopData = data.shops as any;
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
      shortToken,
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

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        short_token,
        customer_name,
        customer_phone,
        page_count,
        copies,
        color,
        double_sided,
        notes,
        total_amount,
        order_status,
        created_at,
        updated_at,
        shops!inner(id, name, address, phone, opening_time, closing_time)
      `
      )
      .eq("short_token", shortToken)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
