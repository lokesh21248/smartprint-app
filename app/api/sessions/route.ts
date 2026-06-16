import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitSessions, rateLimitHeaders } from "@/lib/ratelimit";

// Startup check: catch missing env at cold start, not at runtime per-request
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request) {
  // ── Rate limiting — 10 req/min/IP ─────────────────────────────────────────
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "anonymous";
  const rl = rateLimitSessions(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  // ── Guard: catch misconfigured Vercel env before touching the DB ──────────
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    // FIX S5: log the specific missing vars server-side, return generic message to client.
    // Exposing which env vars are missing tells attackers about server configuration.
    console.error(
      "[POST /api/sessions] FATAL: Missing Supabase env vars. " +
        `Missing: ${[!SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL", !SUPABASE_SERVICE_KEY && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ")}. ` +
        "Set these in Vercel."
    );
    return NextResponse.json(
      { error: "Server configuration error. Please contact support." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { customer_name, shop_slug } = body;

    if (!customer_name || typeof customer_name !== "string" || customer_name.trim().length < 3) {
      return NextResponse.json(
        { error: "Please enter a valid name (minimum 3 characters)." },
        { status: 400 }
      );
    }

    if (!shop_slug || typeof shop_slug !== "string") {
      return NextResponse.json(
        { error: "Shop identifier is required." },
        { status: 400 }
      );
    }

    // Service role client: bypasses RLS entirely — correct for server-side writes
    const supabase = createAdminClient();

    // Auto-capitalize each word
    const formattedName = customer_name
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    const { data, error } = await supabase
      .from("customer_sessions")
      .insert({
        customer_name: formattedName,
        shop_slug: shop_slug.trim().toLowerCase(),
      })
      .select("id")
      .single();

    if (error) {
      // Log full Supabase error object for debugging (code + hint + details)
      console.error("[POST /api/sessions] Supabase Insert Error:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      // Distinguish RLS/permission errors from generic DB failures
      const isPermissionError =
        error.code === "42501" ||
        error.message?.toLowerCase().includes("permission denied") ||
        error.message?.toLowerCase().includes("row-level security");

      if (isPermissionError) {
        console.error(
          "[POST /api/sessions] RLS/Permission error — " +
          "verify SUPABASE_SERVICE_ROLE_KEY in Vercel and run the " +
          "20260511_fix_customer_sessions_rls.sql migration."
        );
        return NextResponse.json(
          { error: "Session service is temporarily unavailable. Please try again." },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { error: "Could not start your session. Please try again." },
        { status: 500 }
      );
    }

    if (!data?.id) {
      console.error("[POST /api/sessions] Insert returned no id — unexpected empty result.");
      return NextResponse.json(
        { error: "Session creation failed unexpectedly. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, sessionId: data.id });
  } catch (err) {
    console.error("[POST /api/sessions] Unhandled exception:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please check your connection and try again." },
      { status: 500 }
    );
  }
}
