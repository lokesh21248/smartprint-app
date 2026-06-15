import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createSignedUrl } from "@/lib/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 10

export async function GET(req: NextRequest) {
  // ── Auth guard ─────────────────────────────────────────────────────────────
  // Signed URLs expose private storage paths — only authenticated users may request them.
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const bucket = searchParams.get("bucket")
    const path = searchParams.get("path")

    if (!bucket || !path) {
      return NextResponse.json({ error: "Missing params: bucket and path are required" }, { status: 400 })
    }

    // Validate path to prevent traversal attacks
    if (path.includes("..") || path.startsWith("/")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 })
    }

    // Generate signed URL — 1 hour TTL
    const signedUrl = await createSignedUrl(bucket, path, 3600)

    return NextResponse.json({ signedUrl })
  } catch (err) {
    console.error("[SIGNED_URL_FATAL]", err)
    const errMsg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
