import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Public routes — no auth check at all, return immediately
const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/register(.*)",
  "/forgot-password(.*)",
  "/unauthorized(.*)",
  // Customer-facing shop & order flow — must be fully public
  "/s(.*)",
  "/order(.*)",
  "/order-upload(.*)",
  "/find-shop(.*)",
  // Public APIs — no auth needed
  "/api/shop/public(.*)",
  "/api/orders(.*)",
  "/api/storage(.*)",
  "/api/sessions(.*)",
]);

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)",
]);

const isDashboardRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/analytics(.*)",
  "/staff(.*)",
  "/settings(.*)",
  "/my-shop(.*)",
  "/shop-profile(.*)",
  "/profile(.*)",
]);

// API routes that belong to the authenticated shop owner dashboard
// Excludes /api/shop/public which is listed in public routes above
const isDashboardApiRoute = createRouteMatcher([
  "/api/shop/orders(.*)",
  "/api/shop/update(.*)",
  "/api/shop/staff(.*)",
  "/api/shop/settings(.*)",
  "/api/shop/orders-list(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // ── Short-circuit public routes immediately ──────────────────────────────
  // IMPORTANT: do this BEFORE calling auth() to avoid Clerk cold-start latency
  // hitting every customer page load and /api/sessions call.
  if (isPublicRoute(req)) return NextResponse.next();

  // ── Only authenticated routes from here ─────────────────────────────────
  const authObj = await auth();
  const { userId, sessionClaims } = authObj;
  const { pathname } = req.nextUrl;

  if (!userId) {
    return authObj.redirectToSignIn();
  }

  const clerkRole = String((sessionClaims?.metadata as any)?.role || "").toLowerCase();

  // Admin routes
  if (isAdminRoute(req)) {
    if (clerkRole !== "admin") {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  }

  // Dashboard + owner API routes — verify shop ownership via DB
  if (isDashboardRoute(req) || isDashboardApiRoute(req)) {
    if (clerkRole === "admin") return NextResponse.next();

    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      const [ownerRes, staffRes] = await Promise.all([
        supabase.from("shops").select("id").eq("clerk_owner_id", userId).maybeSingle(),
        supabase.from("shop_staff").select("role").eq("user_id", userId).maybeSingle(),
      ]);

      const isOwner = !!ownerRes.data;
      const staffRole = String(staffRes.data?.role || "").trim().toLowerCase();
      const isAuthorized = isOwner || ["owner", "manager", "staff"].includes(staffRole);

      if (!isAuthorized) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    } catch (error) {
      console.error("[RBAC ERROR]", error);
      // Fail open — don't block if DB is temporarily unreachable
      return NextResponse.next();
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
