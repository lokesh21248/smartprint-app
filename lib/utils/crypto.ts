import { randomBytes } from "crypto";

// ─── Character sets ───────────────────────────────────────────────────────────
// Unambiguous: no O/0 or I/1 confusion in either set.
const SHOP_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLUG_SUFFIX_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Generates a cryptographically random 6-character shop code.
 * Uses `crypto.randomBytes` — never `Math.random` (not CSPRNG).
 *
 * @example "K7RNVX"
 */
export function generateShopCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes)
    .map((b) => SHOP_CODE_CHARS[b % SHOP_CODE_CHARS.length])
    .join("");
}

/**
 * Converts a shop name to a URL-safe slug (max 60 chars).
 * @example "My Print Shop!" → "my-print-shop"
 */
export function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Appends a cryptographically random 4-char suffix to make a slug unique.
 * Used as a retry strategy when a bare slug collides in the DB.
 * @example "my-print-shop" → "my-print-shop-r7k2"
 */
export function slugWithSuffix(base: string): string {
  const bytes = randomBytes(4);
  const suffix = Array.from(bytes)
    .map((b) => SLUG_SUFFIX_CHARS[b % SLUG_SUFFIX_CHARS.length])
    .join("");
  return `${base}-${suffix}`;
}
