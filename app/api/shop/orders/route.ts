import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      shopId,
      customerName,
      customerPhone,
      files,
      printConfig,
      totalPages,
      totalAmount
    } = body;

    // 1. Fetch the shop pricing securely
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("pricing")
      .eq("id", shopId)
      .single();

    if (shopError || !shop) {
      throw new Error("Shop not found or pricing unavailable");
    }

    // 2. Calculate the total securely
    const pricing = shop.pricing as Record<string, number>;
    const copies = printConfig.copies || 1;
    const rate = printConfig.color === "bw"
      ? (pricing.bw_a4 ?? 2)
      : (pricing.color_a4 ?? 10);

    let secureTotalAmount = totalPages * copies * rate;

    if (printConfig.binding === "spiral") secureTotalAmount += (pricing.binding_spiral ?? 30);
    if (printConfig.binding === "soft") secureTotalAmount += (pricing.binding_soft ?? 50);

    // Generate Order Number: SP-XXXXXX
    const orderNumber = `SP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Generate Short Token for guest tracking
    const shortToken = Math.random().toString(36).substring(2, 10);

    const { data, error } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        short_token: shortToken,
        shop_id: shopId,
        customer_name: customerName,
        customer_phone: customerPhone,
        files,
        print_config: printConfig,
        total_pages: totalPages,
        total_amount: secureTotalAmount, // Use the SECURE server-calculated amount
        status: "placed",
        status_history: [
          { status: "placed", timestamp: new Date().toISOString() }
        ]
      })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      orderId: data.id,
      shortToken: shortToken
    });
  } catch (err: unknown) {
    console.error("Order creation error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
