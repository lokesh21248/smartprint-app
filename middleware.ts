import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/signup(.*)",
  "/verify-email(.*)",
  "/forgot-password(.*)",
  "/s/(.*)",               // Public shop QR landing pages
  "/order/(.*)",           // Public order tracking pages
  "/api/webhooks(.*)",      // Clerk/Stripe webhooks
  "/api/orders(.*)",        // Public guest order creation
  "/api/auth/otp(.*)",      // Public OTP flow
  "/api/storage/presign",   // Public signed upload URL request
  "/api/shop/public",       // Public shop metadata lookup
  "/api/cron(.*)",          // Vercel Cron jobs (protected by CRON_SECRET, not Clerk)
  "/monitoring(.*)",        // Sentry tunnel — must be public or error reports are blocked
]);


export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const authObject = await auth();
    if (!authObject.userId) {
      const signInUrl = new URL("/login", req.url);
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
