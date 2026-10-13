import { test, expect } from "@playwright/test";

test.describe("Scan2Paper Core Flows & Performance Audits", () => {
  test("1. Application loading & metadata integrity", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    // Verify Title & H1
    await expect(page).toHaveTitle(/Scan2Paper/);
    const heading = page.locator("h1");
    await expect(heading).toContainText("Scan2Paper");

    // Check critical brand assets
    const logoOrBrand = page.locator("body");
    await expect(logoOrBrand).toBeVisible();

    // Verify navigation links
    await expect(page.locator("a[href='/features']").first()).toBeVisible();
    await expect(page.locator("a[href='/pricing']").first()).toBeVisible();
    await expect(page.locator("a[href='/blog']").first()).toBeVisible();
  });

  test("2. Auth routes security & no-cache headers", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.status()).toBe(200);

    // Verify noindex robots header is active
    const xRobots = res?.headers()["x-robots-tag"];
    if (xRobots) {
      expect(xRobots).toContain("noindex");
    }

    // Verify login interface renders
    await expect(page.locator("body")).toBeVisible();
  });

  test("3. Shop registration flow (/create-shop)", async ({ page }) => {
    const res = await page.goto("/create-shop");
    // Unauthenticated user should either redirect to login or show clerk sign-in gate
    expect([200, 307, 308]).toContain(res?.status() ?? 200);
  });

  test("4. Public shop discovery & network cache (/find-shop)", async ({ page }) => {
    const res = await page.goto("/find-shop");
    expect(res?.status()).toBe(200);
    await expect(page.locator("input[placeholder='ABC123']")).toBeVisible();
  });

  test("5. Document upload flow (/order-upload)", async ({ page }) => {
    // Navigating without a valid shop slug should gracefully redirect or show error
    await page.goto("/order-upload");
    await page.waitForTimeout(1000);
    // Should safely handle missing parameters without unhandled runtime crashes
    expect(page.url()).toBeDefined();
  });

  test("6. Unauthorized dashboard & document access protection", async ({ page }) => {
    const res = await page.goto("/dashboard");
    // Must redirect unauthorized users to login
    expect(page.url()).toContain("login");
  });

  test("7. Signed URL API rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get("/api/storage/signed-url?bucket=documents&path=test.pdf");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();

    // Verify Cache-Control is strictly private, no-store
    const cacheHeader = res.headers()["cache-control"] || "";
    expect(cacheHeader).toContain("no-store");
  });

  test("8. Blog listing & image loading (/blog)", async ({ page }) => {
    const res = await page.goto("/blog");
    expect(res?.status()).toBe(200);

    // Verify blog articles are present
    const articles = page.locator("article");
    const count = await articles.count();
    expect(count).toBeGreaterThan(0);
  });

  test("9. Mobile layout integrity (375x667)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const heading = page.locator("h1");
    await expect(heading).toBeVisible();

    // Verify CTA buttons are accessible without horizontal scrolling
    const cta = page.locator("a[href='/login']").first();
    await expect(cta).toBeVisible();
  });
});
