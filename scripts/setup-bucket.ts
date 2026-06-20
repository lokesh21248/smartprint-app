import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("❌ Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const bucketName = "order-files";
  console.log(`Setting up Supabase Storage bucket: "${bucketName}"...`);

  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("❌ Error listing buckets:", listError.message);
    process.exit(1);
  }

  const exists = buckets.some((b) => b.name === bucketName);

  if (!exists) {
    console.log(`Bucket "${bucketName}" does not exist. Creating...`);
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false,
      allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"],
      fileSizeLimit: 500 * 1024 * 1024,
    });

    if (createError) {
      console.error("❌ Error creating bucket:", createError.message);
      process.exit(1);
    }
    console.log(`✅ Bucket "${bucketName}" created successfully.`);
  } else {
    console.log(`Bucket "${bucketName}" already exists. Updating configuration...`);
    const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
      public: false,
      allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"],
      fileSizeLimit: 500 * 1024 * 1024,
    });

    if (updateError) {
      console.error("❌ Error updating bucket:", updateError.message);
      process.exit(1);
    }
    console.log(`✅ Bucket "${bucketName}" configuration updated successfully.`);
  }
}

run();
