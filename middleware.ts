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
  // 1. Public routes — skip Clerk entirely
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // 2. Resolve Clerk session
  const { userId, sessionClaims, redirectToSignIn } = await auth();

  // 3. Admin routes — fast claims check, no DB
  if (isAdminRoute(req)) {
    if (!userId) {
      console.log(`[MIDDLEWARE DEBUG] Redirecting to sign in (no userId) for admin route: ${req.url}`);
      return redirectToSignIn();
    }
    const role = (
      (sessionClaims?.metadata as Record<string, unknown>)?.role ?? ""
    )
      .toString()
      .toLowerCase();
    
    console.log(`[MIDDLEWARE DEBUG] Admin route check: userId=${userId}, clerk_role=${role}`);
      
    if (role !== "admin") {
      console.log(`[MIDDLEWARE DEBUG] Redirecting to unauthorized (role !== admin) for admin route: ${req.url}, but allowing per user request`);
      // return NextResponse.redirect(new URL("/unauthorized", req.url)); // Removed per user request
    }
    return NextResponse.next();
  }

  // 4. Protected routes — require sign-in only
  if (isProtectedRoute(req)) {
    if (!userId) {
      console.log(`[MIDDLEWARE DEBUG] Redirecting to sign in (no userId) for protected route: ${req.url}`);
      return redirectToSignIn();
    }
    console.log(`[MIDDLEWARE DEBUG] Allowing protected route: ${req.url}`);
    return NextResponse.next();
  }

  // 5. All other routes — allow
  return NextResponse.next();
});

// ─── MATCHER ──────────────────────────────────────────────────────────────────
export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
