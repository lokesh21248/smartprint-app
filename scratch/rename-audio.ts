import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const bucket = "audio";
  const folder = "notifications";
  const targetName = "notifications/new-order.mp3";

  // 1. List all files in the notifications folder
  console.log(`[Rename] Listing files in ${bucket}/${folder}...`);
  const { data: files, error: listError } = await supabase.storage.from(bucket).list(folder);

  if (listError) {
    console.error("[Rename] ❌ Failed to list files:", listError.message);
    process.exit(1);
  }

  console.log("[Rename] Files found:", files?.map(f => f.name));

  // 2. Find the actual audio file (not new-order.mp3 since it may be wrong)
  const sourceFile = files?.find(f => f.name !== "new-order.mp3" && (f.name.endsWith(".mp3") || f.name.endsWith(".wav") || f.name.endsWith(".ogg")));

  if (!sourceFile) {
    // Check if new-order.mp3 itself exists and is valid
    const existing = files?.find(f => f.name === "new-order.mp3");
    if (existing) {
      console.log("[Rename] new-order.mp3 already exists. Checking if it needs replacement...");
      const url = supabase.storage.from(bucket).getPublicUrl(targetName).data.publicUrl;
      console.log("[Rename] Public URL:", url);
      return;
    }
    console.error("[Rename] ❌ No audio file found in notifications folder.");
    process.exit(1);
  }

  const sourcePath = `${folder}/${sourceFile.name}`;
  console.log(`[Rename] Found source file: ${sourcePath}`);
  console.log(`[Rename] Copying to: ${targetName}...`);

  // 3. Copy source → new-order.mp3
  const { error: copyError } = await supabase.storage.from(bucket).copy(sourcePath, targetName);
  if (copyError) {
    console.error("[Rename] ❌ Copy failed:", copyError.message);
    process.exit(1);
  }
  console.log("[Rename] ✅ Copy successful.");

  // 4. Delete the old wrongly-named file
  console.log(`[Rename] Deleting old file: ${sourcePath}...`);
  const { error: deleteError } = await supabase.storage.from(bucket).remove([sourcePath]);
  if (deleteError) {
    console.warn("[Rename] ⚠️ Delete failed (file still copied OK):", deleteError.message);
  } else {
    console.log("[Rename] ✅ Old file deleted.");
  }

  // 5. Print the final public URL
  const { data } = supabase.storage.from(bucket).getPublicUrl(targetName);
  console.log("\n[Rename] ✅ DONE! Public URL:");
  console.log(data.publicUrl);
  console.log("\nPaste this URL in your browser to verify the audio plays.");
}

main().catch(console.error);
