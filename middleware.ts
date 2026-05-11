import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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

export default clerkMiddleware(async (auth, req) => {
  // 1. Allow public routes
  if (isPublicRoute(req)) return;

  // 2. Protect all other routes (Dashboard, etc.)
  // auth().protect() handles the redirect to login automatically
  const authObj = await auth();
  
  if (!authObj.userId) {
    return authObj.redirectToSignIn();
  }

  // 3. Admin Route Protection
  // Disabled per user request to "remove concept for now"
  /*
  if (isAdminRoute(req)) {
    const role = (authObj.sessionClaims?.metadata as any)?.role;
    if (role !== "admin") {
      const { nextUrl } = req;
      return Response.redirect(new URL("/unauthorized", nextUrl));
    }
  }
  */
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
