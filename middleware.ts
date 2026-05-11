import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/verify-email(.*)",
  "/forgot-password(.*)",
  "/s/(.*)",               // Public shop QR landing pages
  "/order/(.*)",           // Public order tracking pages (customer)
  "/order-upload(.*)",     // Public order upload flow (customer-facing)
  "/find-shop(.*)",        // Public shop finder
  "/api/webhooks(.*)",      // Clerk/Stripe webhooks
  "/api/orders(.*)",        // Public guest order creation
  "/api/auth/otp(.*)",      // Public OTP flow
  "/api/storage/presign",   // Public signed upload URL request
  "/api/shop/public",       // Public shop metadata lookup
  "/api/cron(.*)",          // Vercel Cron jobs
  "/monitoring(.*)",        // Sentry tunnel
  "/api/sessions(.*)",      // Public customer session creation
  "/unauthorized",          // Access denied page
]);

const isDashboardRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/orders(.*)",
  "/analytics(.*)",
  "/staff(.*)",
  "/settings(.*)",
  "/my-shop(.*)",
]);

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();

  // 1. Basic Auth Guard
  if (!isPublicRoute(req)) {
    if (!userId) {
      const signInUrl = new URL("/login", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  // 2. Role-Based Access Control (RBAC)
  // We use publicMetadata from Clerk session for fast middleware checks
  const role = sessionClaims?.metadata?.role as string | undefined;

  // Protect Admin Routes
  if (isAdminRoute(req)) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
  }

  // Protect Dashboard Routes
  if (isDashboardRoute(req)) {
    if (role !== "admin" && role !== "shop_owner" && role !== "manager" && role !== "staff") {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
