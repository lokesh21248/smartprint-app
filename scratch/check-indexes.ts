import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function run() {
  const { data, error } = await supabase
    .from("pg_indexes")
    .select("*")
    .eq("tablename", "order_files");

  if (error) {
    console.error("❌ Error querying pg_indexes:", error);
  } else {
    console.log("Indexes on order_files:", JSON.stringify(data, null, 2));
  }
}

run();
