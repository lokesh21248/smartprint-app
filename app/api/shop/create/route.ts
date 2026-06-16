import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopCreateSchema } from "@/lib/validators";
import { randomBytes } from "crypto";

/**
 * Converts a shop name to a URL-safe slug.
 * Max 60 chars, lowercase, hyphens instead of spaces.
 */
function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove special chars
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .slice(0, 60);
}

/**
 * Appends a cryptographically random 4-char suffix to make a slug unique.
 *
 * FIX S6: replaced Math.random() with crypto.randomBytes — Math.random() is
 * NOT cryptographically secure and produces predictable sequences that can
 * be guessed or brute-forced.
 */
function slugWithSuffix(base: string): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(4);
  const suffix = Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
  return `${base}-${suffix}`;
}

/**
 * Generates a cryptographically random 6-char shop code.
 * Uses an unambiguous character set (no O, 0, I, 1 confusion).
 *
 * FIX S6: replaced Math.random() with crypto.randomBytes.
 */
function generateShopCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

export async function POST(req: Request) {
  // Run auth() + currentUser() in parallel — currentUser() is a Clerk API
  // round-trip (~50–100ms); neither depends on the other's result.
  const [{ userId }, user] = await Promise.all([auth(), currentUser()]);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerEmail = user?.emailAddresses?.[0]?.emailAddress;
  if (!ownerEmail) {
    return NextResponse.json({ error: "No email on Clerk account" }, { status: 400 });
  }

  // ── Parse + validate with Zod (replaces imperative if-checks) ────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ShopCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as string | undefined;
      if (field) fieldErrors[field] = issue.message;
    }
    return NextResponse.json({ error: "Validation failed", fieldErrors }, { status: 400 });
  }

  const { shopName, ownerName, phone, addressLine1, city, state, pincode } = parsed.data;

  const supabase = createAdminClient();

  // Idempotency: return early if shop already exists for this user
  const { data: existing } = await supabase
    .from("shops")
    .select("id")
    .eq("clerk_owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, shopId: existing.id, alreadyExists: true });
  }

  // ── Generate unique slug — retry on DB unique-constraint violation ────────
  // FIX C7: instead of pre-checking for collisions in a loop (race condition),
  // we attempt the INSERT and retry only on a 23505 (unique constraint) error.
  // This is atomic and race-safe.
  const baseSlug = generateSlug(shopName);
  let shopId: string | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : slugWithSuffix(baseSlug);
    const shopCode = generateShopCode();

    const { data, error } = await supabase
      .from("shops")
      .insert({
        clerk_owner_id: userId,
        name: shopName,
        owner_name: ownerName ?? "Shop Owner",
        owner_email: ownerEmail,
        owner_phone: phone,
        address_line1: addressLine1,
        city,
        state,
        pincode,
        shop_code: shopCode,
        slug,
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

    if (!error) {
      shopId = data.id;
      break;
    }

    // 23505 = unique constraint violation (slug or shop_code collision) — retry
    if (error.code === "23505") {
      lastError = error;
      continue;
    }

    // Any other DB error is fatal
    console.error("[POST /api/shop/create] insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!shopId) {
    console.error("[POST /api/shop/create] Failed to generate unique slug after 5 attempts", lastError);
    return NextResponse.json(
      { error: "Could not generate shop identifier. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, shopId });
}
