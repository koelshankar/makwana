// End-to-end checks for the hardening-1 fixes that a browser can show. (Fixes without a browser
// path, such as a store that throws while restoring, are covered by the Vitest suite.)

import { sampleDesign } from "../src/domain/seed";
import { demoMenu, expect, open, test } from "./fixtures";

const PERSIST_KEY = "makwana:project";
const PERSIST_VERSION = 2;

test.describe("console guard", () => {
  test.fail("fails a test on a console warning", async ({ page }) => {
    await open(page, "/setup");
    await page.evaluate(() => console.warn("deliberate warning"));
  });
});

test.describe("#3 WebGL context lost mid-session", () => {
  // Expected here and nowhere else: Chrome reports the forced loss itself, and when the canvas
  // remounts after the restore, the old renderer's clean-up deletes objects that were created
  // before the loss ("object does not belong to this context"). Harmless; nothing is drawn with them.
  test.use({ allowedConsole: /CONTEXT_LOST_WEBGL|INVALID_OPERATION: delete(VertexArray)?: object does not belong to this context/i });

  test("shows the unavailable panel while lost and remounts the 3D view on restore", async ({ page }) => {
    await open(page, "/design");
    const panel = page.locator("[data-three-panel]");
    const canvas = panel.locator("canvas");
    // Mid-session: the scene has started and drawn before the context goes.
    await expect(panel.locator("canvas[data-scene-ready]")).toHaveCount(1);
    await expect(panel.locator("[data-three-unavailable]")).toHaveCount(0);

    await canvas.evaluate((c: HTMLCanvasElement) => {
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      const ext = gl!.getExtension("WEBGL_lose_context")!;
      (window as unknown as { __lose: WEBGL_lose_context }).__lose = ext;
      ext.loseContext();
    });
    await expect(panel.locator("[data-three-unavailable]")).toBeVisible();
    await expect(panel.getByText("3D view isn't available on this device")).toBeVisible();

    await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
    await expect(panel.locator("[data-three-unavailable]")).toHaveCount(0);
    await expect(panel.locator("canvas[data-scene-ready]")).toHaveCount(1);
    // A fresh canvas with a working context.
    const ok = await canvas.evaluate((c: HTMLCanvasElement) => {
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      return !!gl && !gl.isContextLost();
    });
    expect(ok).toBe(true);
    await page.waitForTimeout(500);
    await panel.screenshot({ path: test.info().outputPath("after-restore.png") });
  });
});

test.describe("#4 second tab", () => {
  test("a second tab shows the blocking notice; the first keeps working", async ({ page, context }) => {
    await open(page, "/setup");
    const second = await context.newPage();
    await second.goto("/design");
    await expect(second.locator("[data-second-tab]")).toBeVisible();
    await expect(second.getByText("This demo is open in another tab.")).toBeVisible();
    await expect(second.locator("main")).toHaveCount(0);

    await expect(page.locator("[data-second-tab]")).toHaveCount(0);
    await page.goto("/design");
    await expect(page.locator("[data-second-tab]")).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
    await second.close();
  });
});

test.describe("#8 discount field", () => {
  test("clearing the field keeps the old discount", async ({ page }) => {
    await open(page, "/quote");
    const input = page.getByLabel("Discount percent");
    await input.fill("4");
    await input.press("Enter");
    await expect(input).toHaveValue("4");
    const total = await page.locator("[data-quote-header-total]").textContent();

    await input.fill("");
    await input.blur();
    await expect(input).toHaveValue("4");
    await expect(page.locator("[data-quote-header-total]")).toHaveText(total!);
  });
});

test.describe("#6, #11, #12 approval and the PDF", () => {
  test("send back names the preparer; DRAFT watermark until approved; customer edit returns to draft", async ({ page, context }) => {
    // A preparer other than the seed's, so a hard-coded name would show.
    await context.addInitScript(
      ([key, version, project]) => {
        if (!sessionStorage.getItem("seeded")) {
          localStorage.setItem(key as string, JSON.stringify({ version, state: { project } }));
          sessionStorage.setItem("seeded", "1");
        }
      },
      [PERSIST_KEY, PERSIST_VERSION, { ...sampleDesign, preparedBy: "Asha Rao" }] as const,
    );
    await open(page, "/quote");

    // #11: a draft PDF carries the watermark.
    await page.goto("/quote/print");
    await expect(page.locator("[data-print-ready]")).toBeVisible();
    await expect(page.locator("[data-watermark]")).toHaveText("DRAFT");
    await open(page, "/quote");

    // #12: sent back toast names the preparer.
    await page.getByRole("button", { name: "Send for Approval" }).click();
    await demoMenu(page, /Switch to Manager/);
    await page.getByRole("button", { name: "Send back" }).click();
    await page.getByLabel("Comment").fill("Keep the discount at 5%");
    await page.locator("[data-send-back-dialog]").getByRole("button", { name: "Send back" }).click();
    await expect(page.getByText("Sent back to Asha Rao")).toBeVisible();

    // Approve, then the PDF has no watermark.
    await demoMenu(page, /Switch to Salesperson/);
    await page.getByRole("button", { name: "Send for Approval" }).click();
    await demoMenu(page, /Switch to Manager/);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("[data-status-pill]")).toHaveAttribute("data-status-pill", "approved");
    await page.goto("/quote/print");
    await expect(page.locator("[data-print-ready]")).toBeVisible();
    await expect(page.locator("[data-watermark]")).toHaveCount(0);

    // #6: editing the customer name returns the approved quote to draft as version 2.
    await open(page, "/setup");
    const customer = page.getByPlaceholder("Customer");
    await customer.fill("Priya Shah");
    await customer.press("Enter");
    await expect(page.getByText(/Quote returned to draft/)).toBeVisible();
    await open(page, "/quote");
    await expect(page.locator("[data-status-pill]")).toHaveAttribute("data-status-pill", "draft");
    await expect(page.locator("[data-quote-title]")).toContainText("Version 2");
  });
});
