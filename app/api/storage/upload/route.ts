import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role so guests can upload without needing to be authenticated
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const shopId = formData.get("shopId") as string | null;

    if (!file || !shopId) {
      return NextResponse.json(
        { error: "Missing file or shopId" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File too large: ${file.name} (max 25MB)` },
        { status: 400 }
      );
    }

    const fileExt = file.name.split(".").pop() ?? "pdf";
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `orders/${shopId}/${uniqueName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("order-files")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[storage/upload] Upload error:", uploadError.message);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Generate a long-lived signed URL (7 days)
    const { data: signedData, error: signError } = await supabase.storage
      .from("order-files")
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    if (signError || !signedData) {
      return NextResponse.json(
        { error: "Failed to generate file URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: signedData.signedUrl, path: filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[storage/upload]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
