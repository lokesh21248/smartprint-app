/**
 * Extracts the real client IP address from request headers.
 *
 * Checks (in priority order):
 *  1. x-forwarded-for  — set by Vercel, Cloudflare, and most proxies
 *  2. x-real-ip        — set by Nginx and some CDNs
 *  3. Falls back to "anonymous" if neither header is present
 *
 * SECURITY NOTE: x-forwarded-for can be spoofed by clients unless your
 * infrastructure strips/overwrites it before it reaches the application.
 * Vercel overwrites the first IP with the real client IP, making it safe.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "anonymous"
  );
}
