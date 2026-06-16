import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/utils/ip";

/**
 * POST /api/shop/find
 * 
 * Securely finds a shop by its 6-character shop_code.
 * Move this logic server-side to enforce rate limits and hide internal fields.
 */
export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: "Valid 6-character code required" }, { status: 400 });
    }

    // Rate limit: 10 attempts per minute per IP to prevent code brute-forcing
    const ip = getClientIp(request);
    const { success } = rateLimit(`shop_find_${ip}`, 10, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
    }

    const supabase = createAdminClient();
    
    const { data: shop, error } = await supabase
      .from("shops")
      .select("id, name, slug, is_active")
      .eq("shop_code", code.toUpperCase())
      .maybeSingle();

    if (error) {
      console.error("[POST /api/shop/find] Query Error:", error);
      return NextResponse.json({ error: "Failed to find shop" }, { status: 500 });
    }

    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    if (!shop.is_active) {
      return NextResponse.json({ error: "This shop is currently unavailable" }, { status: 403 });
    }

    return NextResponse.json({ 
      id: shop.id,
      name: shop.name,
      slug: shop.slug
    });
  } catch (err) {
    console.error("[POST /api/shop/find] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
