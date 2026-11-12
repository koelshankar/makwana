import { open, test, expect } from "./fixtures";

test("smoke: each screen renders without console errors", async ({ page }) => {
  for (const path of ["/setup", "/design", "/quote"]) {
    await open(page, path);
    await expect(page.locator("main")).toBeVisible();
  }
  await page.goto("/quote/print");
  await expect(page.locator("[data-print-ready]")).toBeVisible();
});
