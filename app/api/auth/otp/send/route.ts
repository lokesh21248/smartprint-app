import { NextResponse } from "next/server";
import { sendOtp } from "@/lib/otp";

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();
    if (!phone) return NextResponse.json({ error: "Phone required" }, { status: 400 });
    
    await sendOtp(phone);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
