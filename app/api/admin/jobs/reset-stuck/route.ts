import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { validateApiAccess, logAdminAction } from "@/lib/auth/role-guard";
import { rateLimit } from "@/lib/ratelimit";
import { headers } from "next/headers";

export async function POST(req: Request) {
  const { authorized, response, userId } = await validateApiAccess(["admin"]);
  if (!authorized) return response;

  // 1. Rate Limiting
  const rl = rateLimit(`admin_jobs_${userId}`, 5, 60);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const isDryRun = searchParams.get("dryRun") === "true";
  const body = await req.json();
  const ip = (await headers()).get("x-forwarded-for") || "unknown";

  // 2. Confirmation Check
  if (!isDryRun && !body.confirm) {
    return NextResponse.json({ error: "Confirmation required. Send { confirm: true }" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // 3. Batch Limits: Fetch targets first
  const { data: targets } = await supabase
    .from("webhook_jobs")
    .select("id")
    .eq("status", "processing")
    .lt("updated_at", staleThreshold)
    .limit(50);

  if (!targets?.length) {
    return NextResponse.json({ message: "No stuck jobs found" });
  }

  if (isDryRun) {
    logAdminAction({ userId: userId!, action: "reset_stuck_jobs_dry_run", affectedCount: targets.length, ip, isDryRun: true });
    return NextResponse.json({ 
      message: `[DRY RUN] Would reset ${targets.length} stuck jobs`,
      jobIds: targets.map(t => t.id)
    });
  }

  // 4. Atomic Update for batch
  // 🔴 C4 FIX: .select() → .select("id, status") — avoids returning
  // full JSONB payload columns in the response.
  const { data, error } = await supabase
    .from("webhook_jobs")
    .update({ 
      status: "pending", 
      updated_at: new Date().toISOString() 
    })
    .in("id", targets.map(t => t.id))
    .select("id, status");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAdminAction({ userId: userId!, action: "reset_stuck_jobs", affectedCount: data.length, ip });

  return NextResponse.json({ 
    message: `Successfully reset ${data.length} stuck jobs`,
    jobs: data 
  });
}
