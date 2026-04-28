import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/otp";

export async function POST(request: Request) {
  try {
    const { phone, otp } = await request.json();
    if (!phone || !otp) return NextResponse.json({ error: "Phone and OTP required" }, { status: 400 });
    
    const isValid = await verifyOtp(phone, otp);
    if (!isValid) return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 401 });
    
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
