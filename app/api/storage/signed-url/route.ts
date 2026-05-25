import { NextRequest, NextResponse } from "next/server"
import { createSignedUrl } from "@/lib/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const bucket = searchParams.get("bucket")
    const path = searchParams.get("path")

    if (!bucket || !path) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 })
    }

    // 1. Generate short-lived signed URL (60 seconds)
    const signedUrl = await createSignedUrl(bucket, path, 60)

    return NextResponse.json({ signedUrl })
  } catch (err) {
    console.error("[SIGNED_URL_FATAL]", err)
    const errMsg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    )
  }
}
