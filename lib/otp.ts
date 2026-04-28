import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// A simple salt for OTP hashing (since they are only 6 digits)
const OTP_SALT = process.env.OTP_SALT || "smartprint-default-salt";

function hashOtp(code: string): string {
  return createHash("sha256")
    .update(`${code}-${OTP_SALT}`)
    .digest("hex");
}

export async function sendOtp(phone: string) {
  // Generate 6-digit OTP
  // BYPASS FOR TESTING: Use 123456 for exactly 9999999999
  const otp = phone === "9999999999" 
    ? "123456" 
    : Math.floor(100000 + Math.random() * 900000).toString();
    
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // In production, you would call MSG91 or another SMS service here
  console.log(`[OTP] Sending ${otp} to ${phone}`);
  
  // Store in DB
  const { error } = await supabase
    .from("otp_verifications")
    .insert({
      phone,
      code_hash: hashOtp(otp),
      expires_at: expiresAt.toISOString(),
    });

  if (error) throw error;
  
  return { success: true };
}

export async function verifyOtp(phone: string, code: string) {
  const { data, error } = await supabase
    .from("otp_verifications")
    .select("*")
    .eq("phone", phone)
    .eq("code_hash", hashOtp(code))
    .eq("verified", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return false;

  // Mark as verified
  await supabase
    .from("otp_verifications")
    .update({ verified: true })
    .eq("id", data.id);

  return true;
}
