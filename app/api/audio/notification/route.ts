import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/audio/notification
 *
 * Serves the notification MP3 from the local filesystem (public/sounds/new-order.mp3).
 * Primary audio source: the client now uses /sounds/new-order.mp3 directly,
 * making this route a secondary fallback only.
 *
 * NOTE: The client-side audio module (lib/audio/orderNotification.ts) now loads
 * /sounds/new-order.mp3 directly as a static file, bypassing this route entirely
 * for normal operation. This route is kept for backward compatibility only.
 */
export async function GET() {
  try {
    // Serve from the local filesystem — zero Supabase dependency
    const filePath = path.join(process.cwd(), "public", "sounds", "new-order.mp3");
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err) {
    console.error("[GET /api/audio/notification] Local file read failed:", err);
    // Redirect to static file as last resort
    return NextResponse.redirect(
      new URL("/sounds/new-order.mp3", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    );
  }
}
