import { NextResponse } from "next/server";
import { sendOtp } from "@/lib/otp";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();
    if (!phone) return NextResponse.json({ error: "Phone required" }, { status: 400 });
    
    // Rate limit: 3 OTPs per hour per phone
    const { success } = await rateLimit(`otp_${phone}`, 3, 3600);
    if (!success) {
      return NextResponse.json(
        { error: "Too many OTP requests. Please try again in an hour." },
        { status: 429 }
      );
    }

    await sendOtp(phone);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
