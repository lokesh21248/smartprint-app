import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 🔴 C3 FIX: Removed orphan module-level createClient() that was instantiated here
// but immediately shadowed by createAdminClient() inside the POST handler.
// Also removed unused `upsertShop` import.
// Each dead client consumed one Supabase connection per warm function instance.

export async function POST(req: Request) {
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // 1. Security Check
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  // 2. Queue the Job (Atomic Idempotency)
  const supabase = createAdminClient();
  const { error: queueError } = await supabase.from("webhook_jobs").insert({
    id: svix_id,
    payload: payload,
    status: "pending",
    next_retry_at: new Date().toISOString(),
  });

  if (queueError) {
    if (queueError.code === "23505") {
      // Duplicate event — already queued or processed
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

  // 3. Trigger worker asynchronously (Fire and forget)
  const workerUrl = new URL("/api/webhooks/clerk/worker", req.url);
  fetch(workerUrl, { method: "POST" }).catch(() => {});

  return new Response("OK", { status: 200 });
}
