import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customer_name, shop_slug } = body;

    if (!customer_name || customer_name.trim().length < 3) {
      return NextResponse.json(
        { error: "Customer name must be at least 3 characters." },
        { status: 400 }
      );
    }

    if (!shop_slug) {
      return NextResponse.json(
        { error: "Shop slug is required." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Auto-capitalize words
    const formattedName = customer_name
      .trim()
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const { data, error } = await supabase
      .from("customer_sessions")
      .insert({
        customer_name: formattedName,
        shop_slug
      })
      .select("id")
      .single();

    if (error) {
      console.error("[POST /api/sessions] Insert Error:", error);
      return NextResponse.json({ 
        error: "Failed to create session", 
        details: error.message || error.details || "Database insert failed"
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, sessionId: data.id });
  } catch (err) {
    console.error("[POST /api/sessions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
