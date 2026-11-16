// End-to-end checks for the Feedback 1 items (docs/HARDENING.md, "Feedback 1").

import type { Locator, Page } from "@playwright/test";
import { demoMenu, expect, open, test } from "./fixtures";

const stepper = (page: Page, step: "Room Setup" | "Design" | "Quote") => page.locator("header").getByRole("link", { name: new RegExp(`${step}$`) });

async function resetDemo(page: Page) {
  await demoMenu(page, /Reset demo/);
  await page.locator("[data-confirm-reset]").click();
  await expect(page.getByText("Demo reset: empty Mehta room")).toBeVisible();
}

async function loadSample(page: Page) {
  await demoMenu(page, "Load sample design");
  await expect(page).toHaveURL(/\/setup$/);
}

const wallHeight = (scope: Locator) => scope.getByRole("radiogroup", { name: "Wall height" });

test.describe("Feedback 1 · item 3: Auto wall mode", () => {
  test("Design: Auto hides the walls in front and follows the camera; Cut and Full stay", async ({ page }) => {
    await open(page, "/setup");
    await resetDemo(page);
    await loadSample(page);
    await stepper(page, "Design").click();
    const panel = page.locator("[data-three-panel]");
    const canvas = panel.locator("canvas[data-scene-ready]");
    await expect(canvas).toHaveCount(1);

    // Design keeps Cut at 450 by default; all three options are offered.
    const toggle = wallHeight(panel);
    await expect(toggle.getByRole("radio")).toHaveText(["Auto", "Cut at 450", "Full height"]);
    await expect(toggle.getByRole("radio", { name: "Cut at 450" })).toHaveAttribute("aria-checked", "true");
    await expect(canvas).toHaveAttribute("data-wall-mode", "cut");

    await toggle.getByRole("radio", { name: "Auto" }).click();
    await expect(canvas).toHaveAttribute("data-wall-mode", "auto");
    // From the 3D preset (front-left, above): the near walls hide, A and B with the L kitchen stay.
    await expect(canvas).toHaveAttribute("data-hidden-walls", "C,D,E,F,G,H");

    // Moving the camera updates it: half a turn round shows the other side.
    await panel.getByRole("button", { name: "Rotate right" }).click();
    await panel.getByRole("button", { name: "Rotate right" }).click();
    await expect(canvas).toHaveAttribute("data-hidden-walls", "A,B,F");
    // Top view: nothing in the way.
    await panel.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name: "Top" }).click();
    await expect(canvas).toHaveAttribute("data-hidden-walls", "");

    await toggle.getByRole("radio", { name: "Full height" }).click();
    await expect(canvas).toHaveAttribute("data-wall-mode", "full");
    await toggle.getByRole("radio", { name: "Cut at 450" }).click();
    await expect(canvas).toHaveAttribute("data-wall-mode", "cut");
    await expect(canvas).not.toHaveAttribute("data-hidden-walls", /.*/);
  });

  test("Show customer opens in Auto; leaving it keeps the Design choice", async ({ page }) => {
    await open(page, "/setup");
    await resetDemo(page);
    await loadSample(page);
    await stepper(page, "Design").click();
    const panel = page.locator("[data-three-panel]");
    const canvas = panel.locator("canvas[data-scene-ready]");
    await expect(canvas).toHaveAttribute("data-wall-mode", "cut");

    await page.getByRole("button", { name: "Show customer" }).click();
    await expect(panel).toHaveAttribute("data-customer", "true");
    await expect(wallHeight(panel).getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    await expect(canvas).toHaveAttribute("data-wall-mode", "auto");
    await expect(canvas).toHaveAttribute("data-hidden-walls", "C,D,E,F,G,H");
    // Cut and Full height are still there.
    await wallHeight(panel).getByRole("radio", { name: "Full height" }).click();
    await expect(canvas).toHaveAttribute("data-wall-mode", "full");

    await panel.getByRole("button", { name: "Exit" }).click();
    await expect(panel).not.toHaveAttribute("data-customer", "true");
    await expect(wallHeight(panel).getByRole("radio", { name: "Cut at 450" })).toHaveAttribute("aria-checked", "true");
    await expect(canvas).toHaveAttribute("data-wall-mode", "cut");
  });

  test("Quote screen and PDF picture: Auto by default, Cut and Full on offer", async ({ page, context }) => {
    await context.addInitScript(() => (window.print = () => {}));
    await open(page, "/setup");
    await resetDemo(page);
    await loadSample(page);
    await stepper(page, "Quote").click();
    const card = page.locator("[data-quote-3d]").locator("..");
    const canvas = page.locator("[data-quote-3d] canvas[data-scene-ready]");
    await expect(canvas).toHaveAttribute("data-wall-mode", "auto");
    await expect(canvas).toHaveAttribute("data-hidden-walls", "C,D,E,F,G,H");
    const toggle = wallHeight(card);
    await expect(toggle.getByRole("radio")).toHaveText(["Auto", "Cut at 450", "Full height"]);
    await expect(toggle.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");

    // The PDF picture is taken from this view: Auto, then Cut, give different pictures.
    const picture = async () => {
      await page.locator("[data-download]").click();
      await expect(page.locator("[data-print-ready]")).toBeVisible();
      const src = await page.locator("[data-print-3d]").getAttribute("src");
      await page.getByRole("link", { name: "Back to the quote" }).click();
      await expect(canvas).toHaveCount(1);
      return src;
    };
    const auto = await picture();
    await toggle.getByRole("radio", { name: "Cut at 450" }).click();
    await expect(canvas).toHaveAttribute("data-wall-mode", "cut");
    const cut = await picture();
    expect(auto).toMatch(/^data:image\/png;base64,/);
    expect(cut).toMatch(/^data:image\/png;base64,/);
    expect(auto, "the Auto picture has the far walls at full height").not.toBe(cut);
    await toggle.getByRole("radio", { name: "Auto" }).click();

    // Opened on its own (no picture handed over), the print page renders its picture in Auto too.
    await page.goto("/quote/print");
    await expect(page.locator("[data-print-ready]")).toBeVisible();
    await expect(page.locator("[data-print-3d]")).toHaveAttribute("src", /^data:image\/png;base64,/);
  });
});

test.describe("Feedback 1 · item 4: wall labels on the Design 3D floor", () => {
  test("Design shows A to H; Show customer, the Quote view and the PDF picture don't", async ({ page, context }) => {
    await context.addInitScript(() => (window.print = () => {}));
    await open(page, "/setup");
    await resetDemo(page);
    await loadSample(page);
    await stepper(page, "Design").click();
    const panel = page.locator("[data-three-panel]");
    const canvas = panel.locator("canvas[data-scene-ready]");
    await expect(canvas).toHaveAttribute("data-wall-labels", "A,B,C,D,E,F,G,H");
    await canvas.screenshot({ path: test.info().outputPath("design-labels.png") });

    await page.getByRole("button", { name: "Show customer" }).click();
    await expect(panel).toHaveAttribute("data-customer", "true");
    await expect(canvas).not.toHaveAttribute("data-wall-labels", /.*/);
    await panel.getByRole("button", { name: "Exit" }).click();
    await expect(canvas).toHaveAttribute("data-wall-labels", "A,B,C,D,E,F,G,H");

    // The Quote view, which the PDF picture is taken from, has none.
    await stepper(page, "Quote").click();
    const quote = page.locator("[data-quote-3d] canvas[data-scene-ready]");
    await expect(quote).toHaveAttribute("data-wall-mode", "auto");
    await expect(quote).not.toHaveAttribute("data-wall-labels", /.*/);
    await page.locator("[data-download]").click();
    await expect(page.locator("[data-print-ready]")).toBeVisible();
    await expect(page.locator("[data-print-3d]")).toHaveAttribute("src", /^data:image\/png;base64,/);
  });
});

test.describe("Feedback 1 · item 5: full screen opens the active view", () => {
  // Playwright's Chrome refuses the browser's full screen (as embedded browsers do), which is what
  // made the old button do nothing (and throw "not granted"). The view must fill the window anyway.
  const fillsWindow = async (page: Page, view: Locator) => {
    const box = (await view.boundingBox())!;
    const vp = page.viewportSize()!;
    expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, vp.width, vp.height]);
  };

  test("Room Setup: the plan fills the screen, its menus still open, Esc and the button close it", async ({ page }) => {
    await open(page, "/setup");
    await resetDemo(page);
    const plan = page.locator("section").filter({ has: page.getByRole("img", { name: "Room plan" }) });
    await page.getByRole("button", { name: "Full screen" }).click();
    await expect(plan).toHaveAttribute("data-full-view", "true");
    await fillsWindow(page, plan);
    await expect(page.getByRole("img", { name: "Room plan" })).toBeVisible();
    // Menus portal outside the plan; they still show over it.
    await page.getByRole("button", { name: "Column / beam / duct" }).click();
    await expect(page.getByRole("menuitem", { name: "Column" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Column" })).toHaveCount(0);
    await expect(plan, "Esc closed the menu, not the full screen").toHaveAttribute("data-full-view", "true");
    await page.keyboard.press("Escape");
    await expect(plan).not.toHaveAttribute("data-full-view", /.*/);

    await page.getByRole("button", { name: "Full screen" }).click();
    await expect(plan).toHaveAttribute("data-full-view", "true");
    await page.getByRole("button", { name: "Exit full screen" }).click();
    await expect(plan).not.toHaveAttribute("data-full-view", /.*/);
  });

  test("Design: the plan or elevation, and the 3D view on its preset (Top or 3D)", async ({ page }) => {
    await open(page, "/setup");
    await resetDemo(page);
    await loadSample(page);
    await stepper(page, "Design").click();

    // The views panel opens whichever tab is active: the plan, then a wall inside full screen.
    const views = page.locator("[data-views-panel]");
    await page.getByRole("tab", { name: "Plan", exact: true }).click();
    await views.getByRole("button", { name: "Full screen" }).click();
    await expect(views).toHaveAttribute("data-full-view", "true");
    await fillsWindow(page, views);
    await expect(views.getByRole("img", { name: "Plan with units" })).toBeVisible();
    await views.getByRole("tab", { name: "Wall B", exact: true }).click();
    await expect(views.locator('[data-elevation="B"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(views).not.toHaveAttribute("data-full-view", /.*/);

    // The 3D panel opens with its current preset, salesperson controls and wall letters kept.
    const panel = page.locator("[data-three-panel]");
    const presets = panel.getByRole("radiogroup", { name: "View" });
    await presets.getByRole("radio", { name: "Top" }).click();
    await panel.getByRole("button", { name: "Full screen" }).click();
    await expect(panel).toHaveAttribute("data-full-view", "true");
    await fillsWindow(page, panel);
    await expect(presets.getByRole("radio", { name: "Top" })).toHaveAttribute("aria-checked", "true");
    await expect(panel.locator("canvas[data-scene-ready]")).toHaveAttribute("data-wall-labels", "A,B,C,D,E,F,G,H");
    await expect(panel).not.toHaveAttribute("data-customer", /.*/);
    await presets.getByRole("radio", { name: "3D" }).click();
    await panel.getByRole("button", { name: "Exit full screen" }).click();
    await expect(panel).not.toHaveAttribute("data-full-view", /.*/);
    await expect(presets.getByRole("radio", { name: "3D" })).toHaveAttribute("aria-checked", "true");
  });
});
