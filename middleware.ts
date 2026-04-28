import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/verify-email(.*)",
  "/forgot-password(.*)",
  "/s/(.*)",
  "/order/(.*)",
  "/order-upload(.*)",
  "/api/webhooks(.*)",
  "/api/orders(.*)",
  "/api/auth/otp(.*)",
  "/api/storage(.*)",
  "/api/setup-db"
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const authObject = await auth();
    if (!authObject.userId) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
