import { NextResponse } from "next/server";
import { sendOtp } from "@/lib/otp";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();
    if (!phone) return NextResponse.json({ error: "Phone required" }, { status: 400 });
    
    // Rate limit: 3 OTPs per hour per phone (in-memory, zero DB)
    // AND 10 OTPs per hour per IP to prevent distributed spamming
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "anonymous";
    const { success: phoneOk } = rateLimit(`otp_send_phone_${phone}`, 3, 3600);
    const { success: ipOk } = rateLimit(`otp_send_ip_${ip}`, 10, 3600);

    if (!phoneOk || !ipOk) {
      return NextResponse.json(
        { error: "Too many OTP requests. Please wait a bit." },
        { status: 429 }
      );
    }

    await sendOtp(phone);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/auth/otp/send] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
