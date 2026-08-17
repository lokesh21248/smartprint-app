import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createAdminClient();
    
    // Fetch the notification sound from the "audio" bucket
    // We assume the file is named "new-order.mp3"
    const { data, error } = await supabase.storage
      .from("audio")
      .download("new-order.mp3");
      
    if (error) {
      console.error("[GET /api/audio/notification] Failed to download audio from Supabase bucket:", error);
      // Fallback redirect to local file if Supabase bucket fails or file is not found
      return NextResponse.redirect(new URL("/sounds/new-order.mp3", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
    }
    
    const arrayBuffer = await data.arrayBuffer();
    
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": data.type || "audio/mpeg",
        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err) {
    console.error("[GET /api/audio/notification] Internal error:", err);
    // Fallback on error
    return NextResponse.redirect(new URL("/sounds/new-order.mp3", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }
}
