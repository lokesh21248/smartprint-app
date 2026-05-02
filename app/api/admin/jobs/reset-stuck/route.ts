import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/auth/admin";
import { isRateLimited } from "@/lib/auth/rate-limit";
import { headers } from "next/headers";

export async function POST(req: Request) {
  const { authorized, response, userId } = await requireAdmin();
  if (!authorized) return response;

  // 1. Rate Limiting
  if (isRateLimited(userId!)) {
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
  const { data, error } = await supabase
    .from("webhook_jobs")
    .update({ 
      status: "pending", 
      updated_at: new Date().toISOString() 
    })
    .in("id", targets.map(t => t.id))
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAdminAction({ userId: userId!, action: "reset_stuck_jobs", affectedCount: data.length, ip });

  return NextResponse.json({ 
    message: `Successfully reset ${data.length} stuck jobs`,
    jobs: data 
  });
}
