import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/auth/role-guard";
import { rateLimit } from "@/lib/ratelimit";
import { headers } from "next/headers";

export async function POST(req: Request) {
  const { authorized, response, userId } = await requireAdmin();
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

  // 3. Batch Limits: Fetch targets first
  const { data: targets } = await supabase
    .from("webhook_jobs")
    .select("id")
    .eq("status", "dead")
    .limit(50);

  if (!targets?.length) {
    return NextResponse.json({ message: "No dead jobs to retry" });
  }

  if (isDryRun) {
    logAdminAction({ userId: userId!, action: "retry_dead_jobs_dry_run", affectedCount: targets.length, ip, isDryRun: true });
    return NextResponse.json({ 
      message: `[DRY RUN] Would retry ${targets.length} jobs`,
      jobIds: targets.map(t => t.id)
    });
  }

  // 4. Atomic Update for batch
  // 🔴 C4 FIX: .select() → .select("id, status, retry_count") — avoids returning
  // full JSONB payload columns (could be 200–500KB for 50 jobs).
  const { data, error } = await supabase
    .from("webhook_jobs")
    .update({ 
      status: "pending", 
      retry_count: 0,
      next_retry_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in("id", targets.map(t => t.id))
    .select("id, status, retry_count");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAdminAction({ userId: userId!, action: "retry_dead_jobs", affectedCount: data.length, ip });

  return NextResponse.json({ 
    message: `Successfully moved ${data.length} jobs back to pending`,
    jobs: data 
  });
}
