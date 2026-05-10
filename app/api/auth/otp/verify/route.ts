import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/otp";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(request: Request) {
  try {
    const { phone, otp } = await request.json();
    if (!phone || !otp) {
      return NextResponse.json({ error: "Phone and OTP required" }, { status: 400 });
    }
    
    // Rate limit: 5 attempts per 15 minutes per phone to prevent brute-force
    const { success } = rateLimit(`otp_verify_${phone}`, 5, 900);
    if (!success) {
      return NextResponse.json(
        { error: "Too many failed attempts. Please try again in 15 minutes." },
        { status: 429 }
      );
    }
    
    const isValid = await verifyOtp(phone, otp);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 401 });
    }
    
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/auth/otp/verify] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

