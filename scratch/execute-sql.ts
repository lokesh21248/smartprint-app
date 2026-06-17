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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

const sql = `SELECT * FROM pg_policies WHERE tablename = 'shop_settings';`;

async function run() {
  const PROJECT_REF = new URL(SUPABASE_URL!).hostname.split('.')[0];
  console.log(`Project Reference ID: ${PROJECT_REF}`);

  // Method 1: Try management API database query endpoint
  const mgmtUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  console.log(`Trying Management API query endpoint: ${mgmtUrl}`);
  try {
    const resp = await fetch(mgmtUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    console.log(`Status: ${resp.status} ${resp.statusText}`);
    const text = await resp.text();
    console.log("Management API Response:");
    console.log(text);
  } catch (err) {
    console.error("Management API Error:", err);
  }
}

run();
