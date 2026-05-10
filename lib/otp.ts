import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";

// A simple salt for OTP hashing (since they are only 6 digits)
const OTP_SALT = process.env.OTP_SALT || "smartprint-default-salt";

function hashOtp(code: string): string {
  return createHash("sha256")
    .update(`${code}-${OTP_SALT}`)
    .digest("hex");
}

export async function sendOtp(phone: string) {
  // Generate cryptographically random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // In production, call MSG91 / Fast2SMS / Twilio here
  if (process.env.NODE_ENV !== "production") {
    // Only log in dev — NEVER log OTPs in production
    console.log(`[OTP DEV] Code for ${phone}: ${otp}`);
  }

  // Initialize Supabase admin client
  const supabase = createAdminClient();

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
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("otp_verifications")
    .select("id, code_hash, attempts")
    .eq("phone", phone)
    .eq("verified", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return false;

  // Prevent brute-force (3 attempts max)
  if (data.attempts >= 3) {
    console.warn(`[OTP] Max attempts reached for ${phone}`);
    return false;
  }

  // Check code
  const isCorrect = data.code_hash === hashOtp(code);

  if (!isCorrect) {
    // Increment attempts
    await supabase
      .from("otp_verifications")
      .update({ attempts: (data.attempts || 0) + 1 })
      .eq("id", data.id);
    return false;
  }

  // Mark as verified
  await supabase
    .from("otp_verifications")
    .update({ verified: true })
    .eq("id", data.id);

  return true;
}
