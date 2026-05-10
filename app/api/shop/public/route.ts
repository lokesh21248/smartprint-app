import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/shop/public?slug=xxx
 *
 * Public endpoint — no auth required.
 * Returns only the fields needed for the customer-facing QR landing page.
 * Uses admin client server-side to bypass RLS cleanly.
 */
export async function GET(request: Request) {
  try {
    // Rate limit: 100 requests per minute per IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "anonymous";
    const { success } = rateLimit(`shop_public_${ip}`, 100, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug")?.trim();
    const id = searchParams.get("id")?.trim();

    if (!slug && !id) {
      return NextResponse.json({ error: "slug or id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    let query = supabase
      .from("shops")
      .select(
        "id, name, slug, address_line1, city, state, pincode, owner_phone, is_open, price_bw_per_page, price_color_per_page, business_hours, is_active"
      );

    if (id) {
      query = query.eq("id", id);
    } else if (slug) {
      // Match either the shop_code (uppercase) or the slug (lowercase).
      // Use quoted string syntax so hyphens and dots in slugs don't break the filter.
      query = query.or(
        `shop_code.eq.${slug.toUpperCase()},slug.eq.${slug.toLowerCase()}`
      );
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("[GET /api/shop/public] Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: "Failed to fetch shop" }, { status: 500 });
    }

    if (!data) {
      console.warn(`[GET /api/shop/public] No shop found for slug="${slug}" id="${id}"`);
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    // Build a clean response — don't expose internal fields
    const shop = {
      id: data.id,
      name: data.name,
      slug: data.slug,
      address: [data.address_line1, data.city, data.state, data.pincode]
        .filter(Boolean)
        .join(", "),
      phone: data.owner_phone,
      is_open: data.is_open,
      price_bw_per_page: Number(data.price_bw_per_page) || 0,
      price_color_per_page: Number(data.price_color_per_page) || 0,
      opening_time: (data.business_hours as Record<string, string> | null)?.opening_time || "09:00",
      closing_time: (data.business_hours as Record<string, string> | null)?.closing_time || "21:00",
    };

    // Cache for 30 seconds — short enough to reflect shop status changes
    return NextResponse.json(shop, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("[GET /api/shop/public]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
