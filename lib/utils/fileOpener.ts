"use client";

import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

/**
 * Universal helper to securely open or download any order document/image file.
 * Generates a 1-hour signed URL and opens it in a new window/tab.
 *
 * @param file An object representing the file containing storage_path or url.
 */
export async function openOrderFile(file: { storage_path?: string; url?: string; name?: string }) {
  try {
    const filePath = file.storage_path || file.url;
    if (!filePath) {
      throw new Error("File path is missing");
    }

    const supabase = createClient();
    // Attempt standard direct client-side signed URL creation (1 hour = 3600 seconds)
    const { data, error } = await supabase.storage
      .from("order-files")
      .createSignedUrl(filePath, 3600);

    if (error || !data?.signedUrl) {
      // Fallback: If browser-client direct access is blocked by RLS policies,
      // request the URL via our secure backend API route which uses service-role keys.
      const res = await fetch(`/api/storage/signed-url?bucket=order-files&path=${encodeURIComponent(filePath)}`);
      const apiData = await res.json();
      
      if (apiData.signedUrl) {
        window.open(apiData.signedUrl, "_blank");
        return;
      }
      throw error || new Error("Failed to generate signed URL");
    }

    window.open(data.signedUrl, "_blank");
  } catch (err) {
    console.error("Failed to open file", err);
    toast.error("Unable to open document");
  }
}
