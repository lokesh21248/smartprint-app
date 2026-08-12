import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const orderId = "4e21279e-fdc0-4647-97b1-cc574516f11c";

  // 1. Check current state
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, shop_id")
    .eq("id", orderId)
    .single();
  console.log("Current order state:", order?.status);

  // Reset to PLACED first
  const { error: resetErr } = await supabase
    .from("orders")
    .update({ status: "PLACED", updated_at: new Date().toISOString() })
    .eq("id", orderId);
  console.log("Reset to PLACED:", resetErr ? `ERROR: ${resetErr.message}` : "OK");

  // 2. Test the exact API payload (status: "accepted" lowercase)
  const { error: lowercaseErr } = await supabase
    .from("orders")
    .update({
      status: "accepted", // lowercase — what the API sends
      status_history: [{ status: "accepted", at: new Date().toISOString(), actor: "shop" }],
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (lowercaseErr) {
    console.error("\n=== LOWERCASE 'accepted' UPDATE FAILED ===");
    console.error("  code:", lowercaseErr.code);
    console.error("  message:", lowercaseErr.message);
    console.error("  details:", lowercaseErr.details);
    console.error("  hint:", lowercaseErr.hint);
  } else {
    console.log("\n=== LOWERCASE 'accepted' UPDATE SUCCEEDED ===");
  }

  // 3. Check status constraints
  const { data: constraints, error: constraintErr } = await supabase.rpc("run_sql" as any, {
    query: `
      SELECT conname, pg_get_constraintdef(oid) 
      FROM pg_constraint 
      WHERE conrelid = 'orders'::regclass 
      AND contype = 'c'
      ORDER BY conname;
    `
  });
  if (constraintErr) {
    console.error("Constraint query error:", constraintErr.message);
  } else {
    console.log("\n=== Status constraints ===");
    console.log(JSON.stringify(constraints, null, 2));
  }

  // 4. Check column type  
  const { data: colType, error: colErr } = await supabase.rpc("run_sql" as any, {
    query: `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'orders' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `
  });
  if (colErr) {
    console.error("Column type error:", colErr.message);
  } else {
    console.log("\n=== orders columns ===");
    console.log(JSON.stringify(colType, null, 2));
  }
}

main().catch(console.error);
