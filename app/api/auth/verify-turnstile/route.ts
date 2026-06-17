import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: "Token is missing" }, { status: 400 });
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA";
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();
      if (!data.success) {
        console.warn("[verify-turnstile] Cloudflare verification failed:", data);
        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      console.error("[verify-turnstile] Cloudflare siteverify error or timeout:", fetchErr);
      return NextResponse.json({ error: "Verification service unavailable or timed out" }, { status: 504 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
