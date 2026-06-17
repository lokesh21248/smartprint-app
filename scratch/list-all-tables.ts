import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing env vars!");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function run() {
  const { data: tables, error } = await supabase
    .from("pg_tables")
    .select("tablename")
    .eq("schemaname", "public");

  if (error) {
    console.error("Failed to query pg_tables:", error.message);
  } else {
    console.log("All tables in public schema:");
    console.log(tables.map(t => t.tablename));
  }
}

run();
