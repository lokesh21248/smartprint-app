import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/notifications/audio  (also reachable at /api/audio/notification)
 *
 * Returns the Supabase Storage public URL for the order notification sound.
 * The browser fetches the MP3 DIRECTLY from Supabase Storage/CDN — this
 * route never proxies audio bytes through Next.js.
 *
 * ─── ARCHITECTURE ────────────────────────────────────────────────────────────
 *   Browser → GET /api/notifications/audio → { success: true, url: "https://…" }
 *   Browser → GET <supabase-storage-url>   → 🔊 MP3 stream from Supabase CDN
 *
 * ─── SECURITY ────────────────────────────────────────────────────────────────
 * Uses NEXT_PUBLIC_SUPABASE_ANON_KEY only (never SUPABASE_SERVICE_ROLE_KEY).
 * getPublicUrl() requires no key at all — it is pure URL construction.
 * The anon key is included here only to initialize the Supabase client;
 * storage.getPublicUrl() does not make a network request.
 *
 * ─── PERFORMANCE ─────────────────────────────────────────────────────────────
 * Zero network calls — URL is constructed locally from env vars.
 * P95 target < 50ms.
 * Response is cached for 1 hour (the public URL is stable and permanent).
 *
 * ─── BUCKET ──────────────────────────────────────────────────────────────────
 * bucket : audio
 * path   : notifications/new-order.mp3
 */
export const runtime = "nodejs";
// Cache the URL response at the CDN/Next.js layer — the URL is stable
export const revalidate = 3600; // 1 hour

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      console.error("[GET /api/audio/notification] Missing Supabase env vars");
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Initialize a plain Supabase client (anon key only — no service role)
    // getPublicUrl() is pure URL construction — no network call, no auth needed
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data } = supabase.storage
      .from("audio")
      .getPublicUrl("notifications/new-order.mp3");

    const publicUrl = data?.publicUrl;

    if (!publicUrl) {
      console.error("[GET /api/audio/notification] getPublicUrl returned empty URL");
      return NextResponse.json(
        { success: false, error: "Could not construct storage URL" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, url: publicUrl },
      {
        headers: {
          // Public URL is permanent — allow CDN + browser to cache for 1 hour
          "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err) {
    console.error("[GET /api/audio/notification] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
