import { createAdminClient } from "../lib/supabase/admin";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env.local
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const supabase = createAdminClient();

async function checkIndexes(table: string) {
  const { data, error } = await supabase
    .from("pg_indexes")
    .select("*")
    .eq("tablename", table);

  if (error) {
    console.error(`❌ Error querying indexes for ${table}:`, error);
  } else {
    console.log(`\nIndexes on ${table}:`, JSON.stringify(data, null, 2));
  }
}

async function run() {
  await checkIndexes("orders");
  await checkIndexes("notifications");
  await checkIndexes("shop_staff");
  await checkIndexes("shop_settings");
}

run();
