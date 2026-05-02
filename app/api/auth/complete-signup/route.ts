import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Kept as a no-op for backward compatibility. Shop provisioning has moved to
// the explicit /create-shop flow (POST /api/shop/create).
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
