const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Load env
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  });
}

async function check() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing credentials");
    return;
  }
  console.log("Supabase URL:", url);
  const supabase = createClient(url, key);

  console.log("\n--- Checking shop_staff ---");
  const { data: staffTable, error: staffTableErr } = await supabase
    .from("shop_staff")
    .select("*")
    .limit(1);

  if (staffTableErr) {
    console.error("shop_staff error:", staffTableErr.message);
  } else {
    console.log("shop_staff success:", staffTable);
  }

  console.log("\n--- Checking staff ---");
  const { data: staff, error: staffErr } = await supabase
    .from("staff")
    .select("*")
    .limit(1);

  if (staffErr) {
    console.error("staff error:", staffErr.message);
  } else {
    console.log("staff success:", staff);
  }
}

check().catch(console.error);
