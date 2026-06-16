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
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function check() {
  const dummyFile = {
    order_id: "3533a61e-508f-4735-ad2f-fa6b6c9d08fe",
    file_name: "test-file.pdf",
    storage_path: `orders/test/file-${Date.now()}.pdf`,
    file_size: 100,
    page_count: 1,
    mime_type: "application/pdf",
    scan_status: "pending",
    security_status: "pending",
  };

  const insertRes = await supabase
    .from("order_files")
    .insert(dummyFile)
    .select();

  console.log("Insert order_files response:", JSON.stringify(insertRes, null, 2));
}

check();
