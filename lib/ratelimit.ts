import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Simple database-backed rate limiter
 * @param identifier Unique key (e.g. IP address or phone number)
 * @param limit Max attempts allowed
 * @param windowSeconds Time window in seconds
 * @returns { success: boolean, remaining: number }
 */
export async function rateLimit(
  identifier: string,
  limit: number = 5,
  windowSeconds: number = 3600
) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  // Clean up old logs (optional, ideally a cron job)
  // await supabase.from("audit_log").delete().lt("created_at", windowStart.toISOString());

  // Count recent attempts in audit_log
  const { count, error } = await supabase
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .eq("actor_id", identifier)
    .eq("action", "rate_limit_check")
    .gt("created_at", windowStart.toISOString());

  if (error) {
    console.error("[RateLimit] Error:", error);
    return { success: true, remaining: limit }; // Fail open
  }

  const attempts = count || 0;

  if (attempts >= limit) {
    return { success: false, remaining: 0 };
  }

  // Log this attempt
  await supabase.from("audit_log").insert({
    actor_type: "system",
    actor_id: identifier,
    action: "rate_limit_check",
    payload: { windowSeconds, limit }
  });

  return { success: true, remaining: limit - attempts - 1 };
}
