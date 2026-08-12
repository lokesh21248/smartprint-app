import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. Get the actual columns of the orders table
  const { data: cols, error: colErr } = await supabase
    .from("information_schema.columns" as any)
    .select("column_name, data_type, is_nullable, column_default")
    .eq("table_name", "orders")
    .eq("table_schema", "public")
    .order("ordinal_position");

  if (colErr) {
    console.error("Column query error:", colErr.message);
  } else {
    console.log("\n=== orders table columns ===");
    (cols as any[]).forEach((c: any) =>
      console.log(`  ${c.column_name.padEnd(30)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable}`)
    );
  }

  // 2. Fetch the specific failing order to see its actual status
  const orderId = "4e21279e-fdc0-4647-97b1-cc574516f11c";
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, status, shop_id, updated_at")
    .eq("id", orderId)
    .single();

  if (orderErr) {
    console.error("\nOrder fetch error:", orderErr.message, orderErr.code);
  } else {
    console.log("\n=== Failing order ===");
    console.log("  id:", order.id);
    console.log("  status:", order.status);
    console.log("  shop_id:", order.shop_id);
  }

  // 3. Try a minimal update (status + updated_at only)
  if (order) {
    const { error: updateErr } = await supabase
      .from("orders")
      .update({ status: "ACCEPTED", updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (updateErr) {
      console.error("\n=== Minimal UPDATE failed ===");
      console.error("  code:", updateErr.code);
      console.error("  message:", updateErr.message);
      console.error("  details:", updateErr.details);
      console.error("  hint:", updateErr.hint);
    } else {
      console.log("\n=== Minimal UPDATE succeeded! (status -> ACCEPTED) ===");
      // Revert it
      await supabase
        .from("orders")
        .update({ status: order.status, updated_at: order.updated_at })
        .eq("id", orderId);
      console.log("  Reverted back to:", order.status);
    }
  }
}

main().catch(console.error);
