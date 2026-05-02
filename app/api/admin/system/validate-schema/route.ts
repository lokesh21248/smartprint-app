import { requireAdmin, logAdminAction } from "@/lib/auth/admin";
import { validateSchema } from "@/lib/supabase/schema-validator";
import { NextResponse } from "next/server";

export async function GET() {
  const { authorized, response, userId } = await requireAdmin();
  if (!authorized) return response;

  logAdminAction({ userId: userId!, action: "validate_database_schema" });

  const result = await validateSchema();

  if (!result.valid) {
    return NextResponse.json(
      { 
        status: "invalid", 
        message: "Database schema is missing required tables or columns.",
        errors: result.errors 
      }, 
      { status: 500 }
    );
  }

  return NextResponse.json({ 
    status: "valid", 
    message: "Schema is fully synchronized." 
  });
}
