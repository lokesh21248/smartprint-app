import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/register(.*)",
  "/unauthorized(.*)",
  "/api/shop/public",
  "/api/orders(.*)",
  "/s/(.*)",
  "/order/(.*)",
  "/find-shop(.*)",
]);

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)",
]);

const isDashboardRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/orders(.*)",
  "/analytics(.*)",
  "/staff(.*)",
  "/settings(.*)",
  "/my-shop(.*)",
  "/shop-profile(.*)",
  "/profile(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const authObj = await auth();
  const { userId, sessionClaims } = authObj;
  const { pathname } = req.nextUrl;

  // 1. Allow public routes
  if (isPublicRoute(req)) return;

  // 2. Auth enforcement
  if (!userId) {
    return authObj.redirectToSignIn();
  }

  const clerkRole = String((sessionClaims?.metadata as any)?.role || "").toLowerCase();

  // 3. Admin Route Protection
  if (isAdminRoute(req)) {
    if (clerkRole !== "admin") {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return;
  }

  // 4. Dashboard Route Protection (RBAC)
  if (isDashboardRoute(req) || pathname.startsWith("/api/shop/")) {
    // Admins bypass
    if (clerkRole === "admin") return;

    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      // Check both shops (owners) and shop_staff (employees)
      const [ownerRes, staffRes] = await Promise.all([
        supabase.from("shops").select("id").eq("clerk_owner_id", userId).maybeSingle(),
        supabase.from("shop_staff").select("role").eq("user_id", userId).maybeSingle()
      ]);

      const isOwner = !!ownerRes.data;
      const staffRole = String(staffRes.data?.role || "").trim().toLowerCase();
      
      const allowedRoles = ["owner", "manager", "staff"];
      const isAuthorized = isOwner || allowedRoles.includes(staffRole);

      // [AUTH DEBUG]
      console.log("[AUTH DEBUG]", {
        userId,
        isOwner,
        staffRole,
        pathname,
        isAuthorized
      });

      if (!isAuthorized) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    } catch (error) {
      console.error("[RBAC ERROR]", error);
      // Fallback: don't block if DB is down, but log it
      return;
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
