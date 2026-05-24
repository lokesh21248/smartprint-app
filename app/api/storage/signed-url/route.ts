import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } =
      new URL(req.url)

    const bucket =
      searchParams.get("bucket")

    const path =
      searchParams.get("path")

    console.log("[SIGNED_URL_INPUT]", {
      bucket,
      path
    })

    console.log(
      "[SERVICE_ROLE_EXISTS]",
      !!process.env
        .SUPABASE_SERVICE_ROLE_KEY
    )

    if (!bucket || !path) {
      return NextResponse.json(
        { error: "Missing params" },
        { status: 400 }
      )
    }

    const supabaseAdmin = createClient(
      process.env
        .NEXT_PUBLIC_SUPABASE_URL!,
      process.env
        .SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { data, error } =
      await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(path, 3600)

    console.log("[SIGNED_URL_RESULT]", {
      data,
      error
    })

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          details: error
        },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error(
      "[SIGNED_URL_FATAL]",
      err
    )

    return NextResponse.json(
      {
        error:
          err?.message ||
          "Unknown error"
      },
      { status: 500 }
    )
  }
}
