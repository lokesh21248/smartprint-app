import { NextResponse } from "next/server";

/**
 * DEPRECATED: This endpoint was used for initial schema setup only.
 * For production, use Supabase Migration files or SQL Editor.
 * This endpoint is now disabled for security reasons.
 */
export async function GET() {
  return new NextResponse(null, { status: 410 }); // Gone
}

export async function POST() {
  return new NextResponse(null, { status: 410 });
}
