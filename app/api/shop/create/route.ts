import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreateShopBody {
  shopName?: string;
  ownerName?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

/** Converts a shop name to a URL-safe slug. */
function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")  // remove special chars
    .replace(/\s+/g, "-")           // spaces → hyphens
    .replace(/-+/g, "-")            // collapse multiple hyphens
    .replace(/^-+|-+$/g, "")        // trim leading/trailing hyphens
    .slice(0, 60);                  // max length
}

/** Appends a short random suffix to make a slug unique. */
function slugWithSuffix(base: string): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${base}-${suffix}`;
}

export async function POST(req: Request) {
  // 🟡 M3 FIX: Run auth() + currentUser() in parallel.
  // currentUser() is a Clerk API round-trip (~50–100ms); auth() is a fast JWT parse.
  // Neither depends on the other's result, so Promise.all saves ~50ms on every call.
  const [{ userId }, user] = await Promise.all([auth(), currentUser()]);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerEmail = user?.emailAddresses?.[0]?.emailAddress;
  if (!ownerEmail) {
    return NextResponse.json({ error: "No email on Clerk account" }, { status: 400 });
  }

  let body: CreateShopBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.shopName?.trim() || "";
  const ownerName = body.ownerName?.trim() || "Shop Owner";
  const ownerPhone = body.phone?.trim() || "";
  const addressLine1 = body.addressLine1?.trim() || "";
  const city = body.city?.trim() || "";
  const state = body.state?.trim() || "";
  const pincode = body.pincode?.trim() || "";

  if (name.length < 2 || name.length > 100) {
    return NextResponse.json({ error: "Shop name must be 2–100 characters" }, { status: 400 });
  }
  if (!/^[0-9]{10}$/.test(ownerPhone)) {
    return NextResponse.json({ error: "Phone must be 10 digits" }, { status: 400 });
  }
  if (!/^[0-9]{6}$/.test(pincode)) {
    return NextResponse.json({ error: "Pincode must be 6 digits" }, { status: 400 });
  }
  if (!addressLine1 || !city || !state) {
    return NextResponse.json({ error: "Address, city, and state are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("shops")
    .select("id")
    .eq("clerk_owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, shopId: existing.id, alreadyExists: true });
  }

  // Generate unique slug from shop name — retry with suffix on collision
  const baseSlug = generateSlug(name);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: collision } = await supabase
      .from("shops")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!collision) break;
    slug = slugWithSuffix(baseSlug);
  }

  if (!slug) {
    console.error("[POST /api/shop/create] Failed to generate unique slug");
    return NextResponse.json({ error: "Could not generate shop identifier. Please try again." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("shops")
    .insert({
      clerk_owner_id: userId,
      name,
      owner_name: ownerName,
      owner_email: ownerEmail,
      owner_phone: ownerPhone,
      address_line1: addressLine1,
      city,
      state,
      pincode,
      shop_code: shopCode,   // keep for legacy admin display — not used for routing
      slug,                  // ← canonical public identifier, always set at creation
      is_approved: true,
      is_active: true,
      is_open: true,
      business_hours: {
        opening_time: "09:00",
        closing_time: "21:00",
        working_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        services: [],
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[POST /api/shop/create] insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, shopId: data.id });
}
