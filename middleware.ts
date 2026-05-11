import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/register(.*)",
  "/unauthorized(.*)",
  "/api/shop/public",
  "/api/orders(.*)",
  "/s/(.*)",
  "/order/(.*)",
  "/find-shop(.*)",
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

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)",
]);

export default clerkMiddleware((auth, req) => {
  const { userId, sessionClaims } = auth();

  // 1. If not logged in and trying to access dashboard/admin, redirect to login
  if (!userId && (isDashboardRoute(req) || isAdminRoute(req))) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 2. Admin Route Protection (Clerk Role)
  if (isAdminRoute(req)) {
    const role = (sessionClaims?.metadata as any)?.role;
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
  }

  // 3. For dashboard routes, we let the layout handle the role checks
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
