import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ─── PUBLIC ROUTES ────────────────────────────────────────────────────────────
// These never require a Clerk session. Order matters — more specific first.
const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/register(.*)",
  "/forgot-password(.*)",
  "/verify-email(.*)",
  "/unauthorized(.*)",
  "/not-found(.*)",
  "/sitemap.xml",
  "/robots.txt",

  // Customer-facing flows (no Clerk account required)
  "/s/(.*)",
  "/order(.*)",
  "/order-upload(.*)",
  "/find-shop(.*)",

  // Public APIs
  "/api/orders(.*)",
  "/api/sessions(.*)",
  "/api/storage(.*)",
  "/api/shop/public(.*)",
  "/api/cron(.*)",
  "/api/webhooks(.*)",
  "/api/auth(.*)",
]);

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
// Clerk session claims check only — no DB call.
// Fine-grained guard also runs in: app/admin/layout.tsx + /api/admin handlers.
const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)",
]);

// ─── PROTECTED ROUTES ─────────────────────────────────────────────────────────
// Require sign-in only. Role authorization is handled by layouts and API handlers.
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/analytics(.*)",
  "/settings(.*)",
  "/profile(.*)",
  "/staff(.*)",
  "/shop-profile(.*)",
  "/my-shop(.*)",
  "/create-shop(.*)",
  "/api/shop(.*)",
  "/api/staff(.*)",
]);

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
export default clerkMiddleware(async (auth, req) => {
  // 1. WWW to non-WWW Redirect (Consolidate traffic, avoid search crawler loops)
  const host = req.headers.get("host") || "";
  if (host.startsWith("www.")) {
    const newHost = host.replace(/^www\./, "");
    return NextResponse.redirect(
      `https://${newHost}${req.nextUrl.pathname}${req.nextUrl.search}`,
      308
    );
  }

  // 2. Public routes — skip Clerk entirely
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // 2. Resolve Clerk session
  const { userId, sessionClaims, redirectToSignIn } = await auth();

  // 3. Admin routes — fast claims check, no DB
  if (isAdminRoute(req)) {
    if (!userId) {
      return redirectToSignIn();
    }
    const role = (
      (sessionClaims?.metadata as Record<string, unknown>)?.role ?? ""
    )
      .toString()
      .toLowerCase();

    if (role !== "admin") {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // 4. Protected routes — require sign-in only
  if (isProtectedRoute(req)) {
    if (!userId) {
      return redirectToSignIn();
    }
    return NextResponse.next();
  }

  // 5. All other routes — allow
  return NextResponse.next();
});

// ─── MATCHER ──────────────────────────────────────────────────────────────────
// Uses the Next.js recommended pattern (https://clerk.com/docs/references/nextjs/clerk-middleware#protect-all-routes).
// Explicitly excludes:
//   /_next/static/*  — CSS, JS, font, image static chunks
//   /_next/image/*   — Next.js image optimisation endpoint
//   /favicon.ico     — Browser favicon request
//   /.*\\..*         — Any file with an extension (sitemap.xml, robots.txt, etc.)
//
// ⚠️ Do NOT use the old `/((?!_next|.*\\..*).*)/` pattern — it had a subtle
// flaw where the dot-exclusion was unanch ored and could miss sub-paths inside
// _next/ when Cloudflare or a CDN rewrites the Host header before the regex
// is evaluated.
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static  (Next.js static chunks — CSS, JS, fonts, images)
     *  - _next/image   (Next.js image optimisation endpoint)
     *  - favicon.ico   (browser tab icon)
     *  - Any path whose last segment contains a dot + common static extension.
     *    The `[^?]*` prefix stops at query strings, so `/page?v=1.0` is NOT
     *    excluded but `/file.css` IS. This is the Clerk v6 recommended pattern.
     *
     * ⚠️  DO NOT use the old `/((?!_next|.*\\..*).*)` pattern — the dot-exclusion
     *     is unanchored and can miss sub-paths inside _next/ when Cloudflare or a
     *     CDN rewrites the Host header before the regex is evaluated.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|[^?]*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js(?!on)|woff|woff2|ttf|otf|eot|map)).*)",
    // Always run for API routes regardless of extension
    "/(api|trpc)(.*)",
  ],
};
