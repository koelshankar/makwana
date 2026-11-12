// The handover brief's section 7 focused tests, except "WebGL off", which needs Chrome restarted
// with WebGL disabled. One test per row of the brief's table; each `expect` is its expected result.

import type { Page } from "@playwright/test";
import { demoMenu, expect, open, test } from "./fixtures";

const PERSIST_KEY = "makwana:project";
const title = (page: Page) => page.locator("[data-quote-title]");
const pill = (page: Page) => page.locator("[data-status-pill]");
const stepper = (page: Page, step: "Room Setup" | "Design" | "Quote") => page.locator("header").getByRole("link", { name: new RegExp(`${step}$`) });

async function saved(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, PERSIST_KEY);
}

async function resetDemo(page: Page) {
  await demoMenu(page, /Reset demo/);
  await page.locator("[data-confirm-reset]").click();
  await expect(page.getByText("Demo reset: empty Mehta room")).toBeVisible();
}

async function loadSample(page: Page) {
  await demoMenu(page, "Load sample design");
  await expect(page).toHaveURL(/\/setup$/);
}

/** Sends the open quote for approval and approves it as the manager, back as the salesperson. */
async function approve(page: Page) {
  await page.getByRole("button", { name: "Send for Approval" }).click();
  await demoMenu(page, /Switch to Manager/);
  await page.getByRole("button", { name: "Approve" }).click();
  await demoMenu(page, /Switch to Salesperson/);
  await expect(pill(page)).toHaveAttribute("data-status-pill", "approved");
}

/** Selects a unit on the visible elevation by clicking low on it, and picks another finish. */
async function changeFinish(page: Page, placementId: string) {
  await page
    .locator(`[data-elevation] [data-unit="${placementId}"]`)
    .first()
    .click({ position: { x: 5, y: 5 } });
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector.getByRole("radiogroup", { name: "Finish" }).getByRole("radio", { checked: false }).first().click();
}

test("quote number not used by loading", async ({ page }) => {
  await open(page, "/setup");
  await resetDemo(page);
  await loadSample(page);
  await stepper(page, "Quote").click();
  await expect(title(page)).toHaveText("Draft quote · Version 1");
  await stepper(page, "Room Setup").click();
  await loadSample(page);
  await stepper(page, "Quote").click();
  await expect(title(page)).toHaveText("Draft quote · Version 1");
  await page.getByRole("button", { name: "Send for Approval" }).click();
  await expect(title(page)).toHaveText("Quote MMK-AND-2026-0147 · Version 1");
});

test("download assigns a number", async ({ page, context }) => {
  await context.addInitScript(() => (window.print = () => {}));
  await open(page, "/setup");
  await resetDemo(page);
  await loadSample(page);
  await stepper(page, "Quote").click();
  await expect(title(page)).toHaveText("Draft quote · Version 1");
  await page.locator("[data-download]").click();
  await expect(page).toHaveURL(/\/quote\/print/);
  await expect(page.locator("[data-print-ready]")).toBeVisible();
  await expect(page.locator("body")).toContainText("MMK-AND-2026-0147");
  await page.getByRole("link", { name: "Back to the quote" }).click();
  await expect(title(page)).toHaveText("Quote MMK-AND-2026-0147 · Version 1");
  // The footer button logs the download in Activity, as the Share dialog's button does (M3).
  await page.locator("[data-activity-log] > button").click();
  await expect(page.locator("[data-activity=shared]")).toHaveCount(1);
  await expect(page.locator("[data-activity=shared]")).toContainText("Version 1 shared with Anil Mehta · PDF downloaded to send");
});

test('share in "Only when flagged" mode', async ({ page }) => {
  await open(page, "/setup");
  await resetDemo(page);
  await page.getByRole("button", { name: "Demo menu" }).click();
  await page.getByRole("menuitemradio", { name: "Only when flagged" }).click();
  await page.keyboard.press("Escape");
  await loadSample(page);
  await stepper(page, "Quote").click();
  await expect(page.getByLabel("Discount percent")).toHaveValue("0");
  await expect(pill(page)).toHaveAttribute("data-status-pill", "draft");
  await expect(page.locator("[data-share]")).toBeEnabled();
  await expect(title(page)).toHaveText("Draft quote · Version 1");
  await page.locator("[data-share]").click();
  await expect(page.locator("[data-share-dialog]")).toBeVisible();
  await expect(title(page)).toHaveText("Quote MMK-AND-2026-0147 · Version 1");
  await expect(page.locator("[data-share-dialog]")).toContainText("MMK-AND-2026-0147");
});

test("clipboard unavailable", async ({ page }) => {
  await open(page, "/setup");
  await resetDemo(page);
  await page.getByRole("button", { name: "Demo menu" }).click();
  await page.getByRole("menuitemradio", { name: "Only when flagged" }).click();
  await page.keyboard.press("Escape");
  await loadSample(page);
  await stepper(page, "Quote").click();
  await page.locator("[data-share]").click();
  await page.evaluate(() =>
    Object.defineProperty(Navigator.prototype, "clipboard", {
      get: () => undefined,
    }),
  );
  await page.getByRole("button", { name: "Copy WhatsApp message" }).click();

  const box = page.getByLabel("WhatsApp message");
  await expect(page.locator("[data-manual-copy]")).toHaveText("Press ⌘C / Ctrl+C to copy");
  await expect(box).toBeFocused();
  await expect(box).toHaveClass(/border-mk-accent/);
  const selection = await box.evaluate((t: HTMLTextAreaElement) => [t.selectionStart, t.selectionEnd, t.value.length]);
  expect(selection, "fully selected").toEqual([0, selection[2], selection[2]]);
  expect(selection[2]).toBeGreaterThan(0);
  await expect(page.getByText("WhatsApp message copied")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByText("WhatsApp message copied")).toBeVisible();
  const activity = (await saved(page)).project.activity as {
    action: string;
    detail: string;
  }[];
  expect(activity.filter((a) => a.action === "shared").map((a) => a.detail)).toEqual([expect.stringContaining("WhatsApp message copied")]);
});

test("corrupted save", async ({ page }) => {
  await open(page, "/setup");
  for (const value of ["{{{ not json", JSON.stringify({ version: 2, state: { project: { id: 1 } } })]) {
    await page.evaluate(([key, v]) => localStorage.setItem(key, v), [PERSIST_KEY, value] as const);
    await page.reload();
    await expect(page.locator('[aria-label="Loading project"]')).toHaveCount(0);
    await expect(page.getByText("The saved project couldn't be opened")).toBeVisible();
    await expect(page.getByText("Started from the empty Mehta room instead.")).toBeVisible();
    await expect(page.getByLabel(/^Wall [A-H] length$/)).toHaveCount(8);
    await expect(page.locator("footer")).toContainText("Room closed · 8 walls");
    expect((await saved(page)).project.modules).toEqual([]);
    await page.getByText("The saved project couldn't be opened").waitFor({ state: "hidden" });
  }
});

test.describe("/spike", () => {
  // Expected here and nowhere else: Chrome logs the 404 response itself.
  test.use({
    allowedConsole: /^Failed to load resource: the server responded with a status of 404/,
  });
  test("/spike hidden in production", async ({ page }) => {
    const res = await page.goto("/spike");
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/404|could not be found/i).first()).toBeVisible();
  });
});

test("performance mode (manual) and that it survives a reload", async ({ page }) => {
  await open(page, "/design");
  const canvas = page.locator("[data-three-panel] canvas[data-scene-ready]");
  await expect(canvas).toHaveCount(1);
  await page.waitForTimeout(500);
  const before = await canvas.screenshot();
  const dpr = await page.evaluate(() => window.devicePixelRatio);

  await page.getByRole("button", { name: "Demo menu" }).click();
  await page.locator("[data-performance-mode]").click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await saved(page)).settings.performanceMode).toBe(true);
  // Edges and contact shadows gone: the picture changes, and the canvas draws at pixel ratio 1.
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width / c.getBoundingClientRect().width)).toBeCloseTo(1, 1);
  await canvas.screenshot({
    path: test.info().outputPath("performance-mode.png"),
  });
  if (dpr > 1)
    test.info().annotations.push({
      type: "note",
      description: `device pixel ratio ${dpr}`,
    });

  await page.reload();
  await expect(page.locator('[aria-label="Loading project"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Demo menu" }).click();
  await expect(page.locator("[data-performance-mode]")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
});

test("performance mode (automatic): slow orbiting switches it on, once until Reset demo", async ({ page, context }) => {
  await open(page, "/setup");
  await resetDemo(page);
  await loadSample(page);
  await stepper(page, "Design").click();
  const canvas = page.locator("[data-three-panel] canvas[data-scene-ready]");
  await expect(canvas).toHaveCount(1);
  const toast = page.getByText("Switched to performance mode for smoother 3D");
  const box = (await canvas.boundingBox())!;
  const switchedOn = async () => (await saved(page)).settings.performanceMode as boolean;
  /** Orbits for `ms`, or until performance mode is on (so its 4 s toast is still up). */
  const orbit = async (ms: number) => {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const end = Date.now() + ms;
    for (let i = 0; Date.now() < end; i++) {
      await page.mouse.move(cx + Math.sin(i / 6) * 120, cy + Math.cos(i / 9) * 40);
      if (i % 10 === 9 && (await switchedOn())) break;
    }
    await page.mouse.up();
  };

  // A fast machine: orbiting for 3 s leaves it off.
  await orbit(3000);
  expect((await saved(page)).settings.performanceMode).toBe(false);
  await expect(toast).toHaveCount(0);

  // A slow one: the brief's trick, CPU 20× slower. On a fast GPU that "may or may not be enough"
  // (the frame time is mostly GPU), so if it doesn't switch on, the rest is skipped, not forced.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  await orbit(10000);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  test.skip(!(await switchedOn()), "CPU 20× slowdown didn't make frames slower than 33 ms on this machine; needs a slow machine");
  await expect(toast).toBeVisible();
  const settings = (await saved(page)).settings;
  expect([settings.performanceMode, settings.performanceAutoSwitched]).toEqual([true, true]);

  // Turned off by hand, it doesn't switch on again, however slow.
  await page.getByRole("button", { name: "Demo menu" }).click();
  await page.locator("[data-performance-mode]").click();
  await page.keyboard.press("Escape");
  await toast.waitFor({ state: "hidden" });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  await orbit(6000);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.waitForTimeout(300);
  await expect(toast).toHaveCount(0);
  expect((await saved(page)).settings.performanceMode).toBe(false);

  // Reset demo arms it again.
  await resetDemo(page);
  expect((await saved(page)).settings.performanceAutoSwitched).toBe(false);
});

test("edit after approval returns the quote to draft as version 2", async ({ page }) => {
  await open(page, "/setup");
  await resetDemo(page);
  await loadSample(page);
  await stepper(page, "Quote").click();
  await approve(page);
  await stepper(page, "Design").click();
  await page.getByRole("tab", { name: "Wall A", exact: true }).click();
  await changeFinish(page, "m-sink");
  await expect(page.getByText("Quote returned to draft — approval needed again (Version 2)")).toBeVisible();
  await stepper(page, "Quote").click();
  await expect(title(page)).toHaveText("Quote MMK-AND-2026-0147 · Version 2");
  await expect(pill(page)).toHaveText("Draft");
});

test("undo and redo cover design edits, not the quote paperwork", async ({ page }) => {
  await open(page, "/setup");
  await resetDemo(page);
  await loadSample(page);
  await stepper(page, "Quote").click();
  await approve(page);
  await stepper(page, "Design").click();
  await page.getByRole("tab", { name: "Wall A", exact: true }).click();

  const finishOf = async (id: string) => ((await saved(page)).project.modules as { id: string; finishId: string }[]).find((m) => m.id === id)?.finishId;
  const paperwork = async () => {
    const p = (await saved(page)).project;
    return { status: p.status, quote: p.quote, activity: p.activity };
  };
  const original = await finishOf("m-sink");
  await changeFinish(page, "m-sink");
  const changed = await finishOf("m-sink");
  expect(changed).not.toBe(original);
  await page.keyboard.press("Escape");
  await page
    .locator("[data-elevation] [data-unit=m-hob]")
    .first()
    .click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await saved(page)).project.modules.some((m: { id: string }) => m.id === "m-hob")).toBe(false);
  const after = await paperwork();
  expect(after.status).toBe("draft"); // the edit returned it to draft (Version 2)
  expect(after.quote.version).toBe(2);

  await page.locator("body").click({ position: { x: 5, y: 300 } }); // focus out of any field
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await saved(page)).project.modules.some((m: { id: string }) => m.id === "m-hob")).toBe(true);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => finishOf("m-sink")).toBe(original);
  expect(await paperwork(), "status, number and activity are not undone").toEqual(after);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => finishOf("m-sink")).toBe(changed);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(async () => (await saved(page)).project.modules.some((m: { id: string }) => m.id === "m-hob")).toBe(false);
  expect(await paperwork(), "nor redone").toEqual(after);
  await stepper(page, "Quote").click();
  await expect(title(page)).toHaveText("Quote MMK-AND-2026-0147 · Version 2");
});

test("page title and icon", async ({ page }) => {
  await open(page, "/setup");
  await expect(page).toHaveTitle("Makwana Kitchen Configurator");
  const href = await page.locator('link[rel="icon"]').first().getAttribute("href");
  expect(href).toMatch(/icon\.svg/);
  const res = await page.request.get(href!);
  expect(res.ok()).toBe(true);
  const svg = await res.text();
  expect(svg).toMatch(/<svg/);
  expect(svg).toMatch(/>\s*M\s*</);
});

test.describe("screen error page", () => {
  // Expected here and nowhere else: React reports the error the boundary caught.
  test.use({ allowedConsole: /Error: test\b|The above error occurred/ });

  test("a crash on navigation shows the error page; Reload brings Design back with the project", async ({ page }) => {
    await open(page, "/setup");
    await loadSample(page);
    const before = JSON.stringify((await saved(page)).project);
    await page.evaluate(() => {
      window.ResizeObserver = class {
        constructor() {
          throw new Error("test");
        }
      } as unknown as typeof ResizeObserver;
    });
    await stepper(page, "Design").click();
    await expect(page.locator("[data-screen-error]")).toBeVisible();
    await expect(page.getByText("Something went wrong on this screen")).toBeVisible();
    await page.locator("[data-error-reload]").click();
    await expect(page).toHaveURL(/\/design$/);
    await expect(page.locator("[data-screen-error]")).toHaveCount(0);
    await expect(page.locator("[data-elevation]")).toBeVisible();
    expect(JSON.stringify((await saved(page)).project)).toBe(before);
  });
});
