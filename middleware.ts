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
  "/api/health",
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

// ─── STATIC-BYPASS ROUTES ─────────────────────────────────────────────────────
// Routes that must be fully CDN-cacheable. clerkMiddleware injects
// X-Clerk-Auth-* response headers even on public routes, which Next.js
// treats as per-request data → Cache-Control: no-store.
// By short-circuiting with a plain NextResponse.next() BEFORE the Clerk
// wrapper runs, we keep these responses clean and cacheable.
const isStaticPublicRoute = createRouteMatcher([
  "/",
  "/features(.*)",
  "/pricing(.*)",
  "/about(.*)",
  "/contact(.*)",
  "/blog(.*)",
]);

// ─── CLERK MIDDLEWARE ─────────────────────────────────────────────────────────
//
// NOTE: www → non-www redirect is handled by vercel.json at the Vercel edge
// (before this middleware runs). The duplicate redirect that used to live here
// has been removed to avoid dead code and an extra middleware evaluation.
const clerkHandler = clerkMiddleware(async (auth, req) => {
  // 1. All public routes — skip Clerk session resolution entirely
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // 2. Resolve Clerk session for protected/admin routes
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

// ─── EXPORTED MIDDLEWARE ──────────────────────────────────────────────────────
// Static public routes (homepage, marketing pages) bypass Clerk entirely so
// their responses remain Cache-Control-clean and CDN-cacheable.
// All other routes (auth, dashboard, API) go through the full Clerk handler.
//
// We also explicitly delete any X-Clerk-Auth-* headers and force a public
// Cache-Control, because Vercel's infrastructure may inject Clerk headers
// independently of our handler — which would otherwise keep causing no-store.
export default function middleware(
  req: import("next/server").NextRequest,
  event: import("next/server").NextFetchEvent
) {
  if (isStaticPublicRoute(req)) {
    const res = NextResponse.next();
    // Strip any Clerk-injected headers that would prevent CDN caching
    res.headers.delete("x-clerk-auth-status");
    res.headers.delete("x-clerk-auth-reason");
    res.headers.delete("x-clerk-auth-message");
    // Tell Vercel Edge + Cloudflare this page is publicly cacheable for 1 hour
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    // Correlation ID — allows tracing this request in Vercel logs
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID().slice(0, 12);
    res.headers.set("X-Request-ID", requestId);
    return res;
  }

  // For Clerk-handled routes, attach the correlation header after Clerk processes it
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID().slice(0, 12);
  // Note: Vercel doesn't allow modifying the incoming NextRequest directly;
  // the x-request-id is forwarded via response header for client correlation.
  const res = clerkHandler(req, event);
  // Attach to response so browser DevTools + client can correlate
  if (res instanceof Response) {
    res.headers.set("X-Request-ID", requestId);
  } else if (res && typeof (res as Promise<Response>).then === "function") {
    return (res as Promise<Response>).then((r) => {
      r.headers.set("X-Request-ID", requestId);
      return r;
    });
  }
  return res;
}

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
