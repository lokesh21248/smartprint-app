import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { join } from "path";

dotenv.config({ path: join(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase.rpc("get_table_columns", { table_name: "notifications" });
  if (error) console.log("RPC Error:", error);
  else console.log("RPC Data:", data);

  // If RPC fails, try generic REST POST to run raw SQL (usually not allowed, but let's see)
  
  // Try querying a dummy row to see what columns come back
  const { data: q, error: e } = await supabase.from("notifications").select("*").limit(1);
  if (e) console.error("Error querying notifications:", e);
  else console.log("Notifications Data:", q);

  // Maybe we can insert a dummy and rollback? Or just read the error message when inserting wrong column.
  const { error: e2 } = await supabase.from("notifications").insert([{ user_id: '123', shop_id: '123', type: 'test', title: 'test', body: 'test', related_order_id: '123' }]);
  console.log("Insert Error:", e2);
}

main().catch(console.error);
