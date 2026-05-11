import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Route Matchers ──────────────────────────────────────────────────────────

// Public routes (no auth required)
const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/verify-email(.*)",
  "/forgot-password(.*)",
  "/s/(.*)",               // Public shop QR landing pages
  "/order/(.*)",           // Public order tracking (customer)
  "/order-upload(.*)",     // Public order upload flow (customer-facing)
  "/find-shop(.*)",        // Public shop finder
  "/unauthorized",         // Access denied page
  "/api/webhooks(.*)",     // Clerk/Stripe webhooks
  "/api/orders(.*)",       // Public guest order creation
  "/api/auth/otp(.*)",     // Public OTP flow
  "/api/storage/presign",  // Public signed upload URL
  "/api/shop/public",      // Public shop metadata lookup
  "/api/cron(.*)",         // Vercel cron
  "/monitoring(.*)",       // Sentry tunnel
  "/api/sessions(.*)",     // Public customer session creation
]);

// Admin routes (Admin only)
const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)",
]);

// Dashboard routes (Shop Owner/Staff only)
const isDashboardRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/orders(.*)",
  "/analytics(.*)",
  "/staff(.*)",
  "/settings(.*)",
  "/my-shop(.*)",
  "/shop-profile(.*)",
  "/profile(.*)",
  "/api/shop/update(.*)",
  "/api/shop/stats(.*)",
  "/api/shop/orders-list(.*)",
  "/api/shop/toggle-open(.*)",
  "/api/staff(.*)",
]);

// ─── Middleware Logic ────────────────────────────────────────────────────────

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();
  const url = req.nextUrl.pathname;

  // 1. Allow public routes
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // 2. Force authentication for all other routes
  if (!userId) {
    const signInUrl = new URL("/login", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signInUrl);
  }

  const clerkRole = (sessionClaims?.metadata as Record<string, unknown> | undefined)?.role;

  // 3. Admin Route Protection (Clerk Metadata is source of truth for admins)
  if (isAdminRoute(req)) {
    if (clerkRole !== "admin") {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // 4. Dashboard Route Protection (Database is source of truth for shop roles)
  if (isDashboardRoute(req)) {
    // Admins can access everything
    if (clerkRole === "admin") return NextResponse.next();

    // Check database for shop role
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      const { data: staffRecord } = await supabase
        .from("shop_staff")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      const role = staffRecord?.role;
      const allowedRoles = ["owner"]; // Only shop owners allowed

      if (!role || !allowedRoles.includes(role)) {
        console.warn(`[Security] Unauthorized access attempt to ${url} by user ${userId} (Role: ${role || "customer"})`);
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    } catch (error) {
      console.error("[Middleware] Database role check failed:", error);
      // Fail secure: if we can't verify role, redirect to unauthorized
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

