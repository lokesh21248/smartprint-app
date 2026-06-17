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

async function run() {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`
      }
    });
    if (!res.ok) {
      console.error("Failed to fetch schema:", res.statusText);
      return;
    }
    const schema = await res.json();
    console.log("EXPOSED PATHS:");
    console.log(Object.keys(schema.paths));
    
    console.log("\nDEFINITIONS (TABLES/TYPES):");
    if (schema.definitions) {
      console.log(Object.keys(schema.definitions));
    }
  } catch (e: any) {
    console.error("Error fetching schema:", e.message);
  }
}

run();
