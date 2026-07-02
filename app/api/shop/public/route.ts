import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/utils/ip";

// M3 FIX: Removed `export const dynamic = "force-dynamic"`.
// force-dynamic was defeating the Cache-Control: public, s-maxage=30 header set at the
// bottom of this handler — Next.js overrides CDN caching for any force-dynamic route.
// Without it, Vercel's edge cache serves this high-traffic QR landing endpoint from CDN
// after the first hit, dropping response time from ~80ms to ~5ms for 30s windows.

/**
 * GET /api/shop/public?slug=xxx
 *
 * Public endpoint — no auth required.
 * Returns only the fields needed for the customer-facing QR landing page.
 * Uses admin client server-side to bypass RLS cleanly.
 */
export async function GET(request: Request) {
  // Extract dynamic properties OUTSIDE the try-catch block!
  // Next.js uses an internal Error (DYNAMIC_SERVER_USAGE) to abort static rendering
  // and mark the route as dynamic. If this is inside the try-catch, we swallow the
  // bailout error and fail the Next.js build process.
  const ip = getClientIp(request);
  const { searchParams } = new URL(request.url);
  const slugParam = searchParams.get("slug")?.trim().toLowerCase();
  const id = searchParams.get("id")?.trim();

  try {
    // Rate limit: 100 requests per minute per IP
    const { success } = rateLimit(`shop_public_${ip}`, 100, 60);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!slugParam && !id) {
      return NextResponse.json({ error: "slug or id is required" }, { status: 400 });
    }

    if (slugParam) {
      // Reject obviously invalid slugs before hitting the DB
      if (!/^[a-z0-9-]+$/.test(slugParam)) {
        return NextResponse.json({ error: "Invalid slug format" }, { status: 400 });
      }
    }

    const supabase = createAdminClient();
    let query = supabase
      .from("shops")
      .select(
        "id, name, slug, address_line1, city, state, pincode, owner_phone, is_open, price_bw_per_page, price_color_per_page, business_hours, is_active"
      );

    if (id) {
      query = query.eq("id", id);
    } else if (slugParam) {
      // Slug is the canonical public identifier — query only by exact slug match.
      query = query.eq("slug", slugParam);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("[GET /api/shop/public] Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: "Failed to fetch shop" }, { status: 500 });
    }

    if (!data) {
      console.warn(`[GET /api/shop/public] No shop found — slug="${slugParam ?? ""}" id="${id ?? ""}"`);
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    // Build a clean response — don't expose internal fields
    type BusinessHours = {
      opening_time?: string;
      closing_time?: string;
      services?: string[];
      working_days?: string[];
    };
    const bh = data.business_hours as BusinessHours | null;
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
      opening_time: bh?.opening_time || "09:00",
      closing_time: bh?.closing_time || "21:00",
      services: bh?.services || [],
      working_days: bh?.working_days || [],
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
