import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const bucketName = "audio";
  const fileName = "notifications/new-order.mp3";
  const sourceFile = path.join(process.cwd(), "public/sounds/whatsapp.mp3");

  // 1. Create Bucket
  console.log("Checking bucket...");
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.find((b) => b.name === bucketName);

  if (!bucketExists) {
    console.log(`Creating bucket: ${bucketName}...`);
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
    });
    if (createError) {
      console.error("Error creating bucket:", createError.message);
    } else {
      console.log("Bucket created successfully.");
    }
  } else {
    console.log("Bucket already exists.");
  }

  // 2. Upload File
  console.log("Uploading audio file...");
  if (!fs.existsSync(sourceFile)) {
    console.error(`Source file not found: ${sourceFile}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(sourceFile);
  const { error: uploadError } = await supabase.storage.from(bucketName).upload(fileName, fileBuffer, {
    contentType: "audio/mpeg",
    upsert: true,
  });

  if (uploadError) {
    console.error("Error uploading file:", uploadError.message);
  } else {
    console.log("File uploaded successfully.");
    
    // Test fetching the public URL
    const { data } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    console.log("Public URL:", data.publicUrl);
  }
}

main().catch(console.error);
