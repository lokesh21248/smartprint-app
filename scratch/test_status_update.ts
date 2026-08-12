import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const orderId = "4e21279e-fdc0-4647-97b1-cc574516f11c";
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, shop_id")
    .eq("id", orderId)
    .single();

  console.log("Current status:", order?.status);

  // Test exact payload that the API sends (with status_history)
  const fullPayload = {
    status: "ACCEPTED",
    status_history: [{ status: "accepted", at: new Date().toISOString(), actor: "shop" }],
    updated_at: new Date().toISOString(),
  };

  const { error: fullErr } = await supabase
    .from("orders")
    .update(fullPayload)
    .eq("id", orderId);

  if (fullErr) {
    console.error("\n=== FULL PAYLOAD UPDATE FAILED ===");
    console.error("  code:", fullErr.code);
    console.error("  message:", fullErr.message);
    console.error("  details:", fullErr.details);
    console.error("  hint:", fullErr.hint);
  } else {
    console.log("\n=== FULL PAYLOAD UPDATE SUCCEEDED ===");
    // Revert
    await supabase.from("orders").update({ status: "PLACED", updated_at: new Date().toISOString() }).eq("id", orderId);
  }

  // Test without status_history but with cancellation_reason
  const withCancellation = {
    status: "CANCELLED",
    cancellation_reason: "Test reason",
    updated_at: new Date().toISOString(),
  };

  const { error: cancelErr } = await supabase
    .from("orders")
    .update(withCancellation)
    .eq("id", orderId);

  if (cancelErr) {
    console.error("\n=== CANCELLATION PAYLOAD FAILED ===");
    console.error("  code:", cancelErr.code);
    console.error("  message:", cancelErr.message);
    console.error("  details:", cancelErr.details);
  } else {
    console.log("\n=== CANCELLATION PAYLOAD SUCCEEDED ===");
    await supabase.from("orders").update({ status: "PLACED", updated_at: new Date().toISOString() }).eq("id", orderId);
  }
}

main().catch(console.error);
