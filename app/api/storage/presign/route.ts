import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";

/**
 * POST /api/storage/presign
 *
 * Issues a short-lived Supabase Storage upload URL so the browser can upload
 * PDFs DIRECTLY to Supabase Storage — bypassing Vercel entirely.
 *
 * Why this matters at scale:
 * - Vercel Serverless has a 4.5 MB default body limit (50 MB on Pro).
 * - Even on Pro, routing a 25 MB PDF through a Vercel function wastes memory,
 *   burns execution time, and blocks the connection pool.
 * - Direct-to-storage means Vercel only handles a tiny JSON request; Supabase
 *   handles all the bandwidth.
 *
 * Flow:
 * 1. Client → POST /api/storage/presign   { shopId, fileName, fileSize, mimeType }
 * 2. Server validates + issues signed upload URL (60s TTL)
 * 3. Client → PUT <signedUploadUrl>  (binary PDF, direct to Supabase)
 * 4. Client → POST /api/orders        { filePath, ... }  (tiny JSON payload)
 */

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB hard cap
const ALLOWED_MIME_TYPES = ["application/pdf"];
const BUCKET = "order-files";
const URL_TTL_SECONDS = 120; // 2 minutes to complete the upload

export async function POST(request: Request) {
  try {
    // Initialize Supabase admin client (fresh instance per request)
    const supabase = createAdminClient();

    // 1. Rate limit — 5 presigns per IP per 5 minutes (in-memory, zero DB)
    const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
    const { success } = rateLimit(`presign_${ip}`, 5, 300);
    if (!success) {
      return NextResponse.json(
        { error: "Too many upload requests. Please wait a few minutes." },
        { status: 429 }
      );
    }

    // 2. Hard timeout for Storage interaction (10 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // 3. Parse & validate body
    const body = await request.json().catch(() => null);
    if (!body) {
      clearTimeout(timeoutId);
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { shopId, fileName, fileSize, mimeType } = body as {
      shopId?: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
    };

    if (!shopId || !fileName || !fileSize || !mimeType) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        { error: "Missing required fields: shopId, fileName, fileSize, mimeType" },
        { status: 400 }
      );
    }

    // 3. Validate file type (PDF only)
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 415 }
      );
    }

    // 4. Validate file size (max 25 MB)
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB` },
        { status: 413 }
      );
    }

    // 5. Confirm shop exists (prevent orphan uploads)
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("id", shopId)
      .maybeSingle();

    if (shopError || !shop) {
      clearTimeout(timeoutId);
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    // 6. Generate unique storage path
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "pdf";
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const storagePath = `orders/${shopId}/${uniqueName}`;

    // 7. Issue signed upload URL (client PUTs directly to this URL)
    const { data: signedData, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath, { 
        upsert: false 
      });

    clearTimeout(timeoutId);

    if (signError || !signedData) {
      console.error("[presign] Failed to create signed URL:", signError?.message);
      return NextResponse.json(
        { error: "Failed to create upload URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      signedUrl: signedData.signedUrl,   // Client PUTs the file here
      token: signedData.token,
      storagePath,                        // Client sends this to POST /api/orders
      expiresIn: URL_TTL_SECONDS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[presign]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
