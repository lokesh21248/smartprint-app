import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Try loading env files
const envLocalPath = path.join(process.cwd(), ".env.local");
const envPath = path.join(process.cwd(), ".env");

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Supabase URL present:", !!url, url);
console.log("Supabase Service Key present:", !!serviceKey);

if (!url || !serviceKey) {
  console.error("Missing env vars!");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function checkSchema() {
  const restUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
  const shopId = '7d914133-a97a-4695-bb21-07320fe8c71d';
  const userId = 'user_3Dwpve81lGJwRA8p8mODRDIQaWJ';

  const { data, error } = await supabase
    .from("orders")
    .select(
      [
        "id",
        "short_token",
        "shop_id",
        "customer_name",
        "customer_phone",
        "file_name",
        "page_count",
        "copies",
        "is_color",
        "is_double_sided",
        "notes",
        "total_amount",
        "status",
        "created_at",
        "updated_at",
        "shops!inner(clerk_owner_id)",
      ].join(", "),
      { count: "estimated" }
    )
    .eq("shop_id", shopId)
    .eq("shops.clerk_owner_id", userId);

  console.log("Query Error:", error);
  console.log("Query Result Length:", data ? data.length : null);

  type OrderFileRow = {
    id: string;
    scan_status: string | null;
  };

  const rows = (data ?? []) as any[];
  const orderIds = rows.map((o) => o.id);
  const orderFilesMap: Record<string, OrderFileRow[]> = {};

  if (orderIds.length > 0) {
    const { data: filesData, error: filesError } = await supabase
      .from("order_files")
      .select("id, order_id, scan_status")
      .in("order_id", orderIds);

    console.log("Files fetch error:", filesError);
    console.log("Files count:", filesData ? filesData.length : null);

    if (filesData) {
      filesData.forEach((file: any) => {
        if (!orderFilesMap[file.order_id]) {
          orderFilesMap[file.order_id] = [];
        }
        orderFilesMap[file.order_id].push({
          id: file.id,
          scan_status: file.scan_status,
        });
      });
    }
  }

  if (rows.length > 0) {
    console.log("Mapped first order with file security status:");
    console.log({
      id: rows[0].id,
      customer_name: rows[0].customer_name,
      file_name: rows[0].file_name,
      files: orderFilesMap[rows[0].id] || [],
    });
  }
}

checkSchema();
