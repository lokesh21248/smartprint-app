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
  console.log("RPC Error:", error);
  
  const { data: q2, error: err2 } = await supabase.from("notifications").select("*").limit(1);
  console.log("Data:", q2);
  console.log("Error:", err2);
}

main().catch(console.error);
