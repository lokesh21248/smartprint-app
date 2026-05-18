import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Env guard: fail fast at cold start, not per-request ──────────────────────
const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error(
    "[FATAL] CLERK_WEBHOOK_SECRET is not set. " +
    "Webhooks will be rejected. Set this in your Vercel environment variables."
  );
}

export async function POST(req: Request) {
  // ── 1. Reject immediately if secret is missing ──────────────────────────────
  if (!WEBHOOK_SECRET) {
    console.error("[webhook] CLERK_WEBHOOK_SECRET not configured — rejecting all webhooks");
    return new Response("Server misconfiguration", { status: 500 });
  }

  // ── 2. Validate required Svix headers ───────────────────────────────────────
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.warn("[webhook] Missing Svix headers — rejecting");
    return new Response("Missing required headers", { status: 400 });
  }

  // ── 3. Timestamp drift protection (reject events older than 5 minutes) ──────
  const timestampSeconds = parseInt(svix_timestamp, 10);
  if (isNaN(timestampSeconds)) {
    console.warn("[webhook] Invalid svix-timestamp — rejecting");
    return new Response("Invalid timestamp", { status: 400 });
  }
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > 300) {
    console.warn(
      `[SECURITY] Webhook replay detected — timestamp drift: ${ageSeconds}s (max 300s). ` +
      `svix-id: ${svix_id}`
    );
    return new Response("Timestamp too old", { status: 400 });
  }

  // ── 4. Read raw body as text for exact-bytes signature verification ─────────
  // IMPORTANT: use req.text() not req.json() — Svix verifies the raw string.
  // If we parse JSON first, whitespace/encoding differences break the signature.
  const rawBody = await req.text();

  // ── 5. Verify Svix signature ────────────────────────────────────────────────
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(rawBody, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.warn(
      `[SECURITY] Webhook signature verification failed — svix-id: ${svix_id}, error: ${message}`
    );
    return new Response("Invalid signature", { status: 401 });
  }

  // ── 6. Parse verified payload ───────────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[webhook] Failed to parse verified body as JSON");
    return new Response("Invalid payload", { status: 400 });
  }

  // ── 7. Queue the job (atomic idempotency via svix_id unique constraint) ─────
  const supabase = createAdminClient();
  const { error: queueError } = await supabase.from("webhook_jobs").insert({
    id: svix_id,
    payload: payload,
    status: "pending",
    next_retry_at: new Date().toISOString(),
  });

  if (queueError) {
    if (queueError.code === "23505") {
      // Duplicate event — already queued or processed. Return 200 so Clerk doesn't retry.
      return new Response("OK", { status: 200 });
    }
    console.error(
      JSON.stringify({
        status: "queue_error",
        error: queueError.message,
        eventId: svix_id,
      })
    );
    return new Response("Database Error", { status: 500 });
  }

  console.log(
    JSON.stringify({
      status: "queued",
      event: evt.type,
      eventId: svix_id,
      timestamp: new Date().toISOString(),
    })
  );

  // ── 8. Trigger worker asynchronously (fire and forget) ──────────────────────
  const workerUrl = new URL("/api/webhooks/clerk/worker", req.url);
  fetch(workerUrl, {
    method: "POST",
    headers: { "x-worker-secret": WEBHOOK_SECRET },
  }).catch(() => {});

  return new Response("OK", { status: 200 });
}
