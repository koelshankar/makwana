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

test.describe("Feedback 1 · item 1: deleting a wall leaves a gap", () => {
  /** Each standing wall's polygon in the Room Setup plan (world mm), keyed by wall. */
  const wallShapes = (page: Page) =>
    page.locator('svg[aria-label="Room plan"] polygon:has(title)').evaluateAll((ps) =>
      Object.fromEntries(ps.map((p) => [p.querySelector("title")!.textContent!.split(" ·")[0], p.getAttribute("points")!.split(" ")])),
    );
  const footer = (page: Page) => page.locator("footer");

  test("the other walls stay put; the gap is dashed; draw it back, Close room, or a template", async ({ page }) => {
    await open(page, "/setup");
    await resetDemo(page);
    const before = await wallShapes(page);

    await page.getByRole("button", { name: "Delete wall C" }).click();
    await expect(page.locator('[data-open-wall="C"]')).toBeVisible();
    const after = await wallShapes(page);
    expect(Object.keys(after)).toEqual(["Wall A", "Wall B", "Wall D", "Wall E", "Wall F", "Wall G", "Wall H"]);
    // Every other wall is exactly where it was; B and D keep their room faces (inner corners).
    for (const id of ["Wall A", "Wall E", "Wall F", "Wall G", "Wall H"]) expect(after[id], id).toEqual(before[id]);
    for (const id of ["Wall B", "Wall D"]) expect(after[id].slice(0, 2), id).toEqual(before[id].slice(0, 2));

    // Shown dashed with its letter and length; the room is open and design is locked.
    const gap = page.locator('[data-gap="C"]');
    await expect(gap.locator("line[stroke-dasharray]")).toHaveCount(1);
    await expect(gap).toContainText("C · 1600 · open");
    await expect(footer(page)).toContainText("Room open · 7 walls · 1 gap");
    await expect(footer(page)).toContainText("Wall C is open: draw a wall in the 1600 mm gap between Wall B and Wall D.");
    await expect(page.getByRole("button", { name: "Start Designing" })).toBeDisabled();
    await expect(page.locator("[data-room-open]")).toHaveText("Open at C · 1600 mm");
    await page.locator("main, body").first().screenshot({ path: test.info().outputPath("gap.png") });

    // Draw the wall in from the plan: the same letter, length and heading.
    // A straight line has a zero-height box: click its middle on screen, as a person would.
    const mid = await gap.locator("line").first().evaluate((l: SVGLineElement) => {
      const m = l.getScreenCTM()!;
      const p = new DOMPoint((l.x1.baseVal.value + l.x2.baseVal.value) / 2, (l.y1.baseVal.value + l.y2.baseVal.value) / 2).matrixTransform(m);
      return { x: p.x, y: p.y };
    });
    await page.mouse.click(mid.x, mid.y);
    await page.getByRole("button", { name: "Draw Wall C", exact: true }).click();
    await expect(footer(page)).toContainText("Room closed · 8 walls");
    expect(await wallShapes(page)).toEqual(before);
    await expect(page.getByRole("button", { name: "Start Designing" })).toBeEnabled();

    // From the walls list, and with Close room.
    await page.getByRole("button", { name: "Delete wall C" }).click();
    await page.getByRole("button", { name: "Draw wall C", exact: true }).click();
    await expect(footer(page)).toContainText("Room closed · 8 walls");
    await page.getByRole("button", { name: "Delete wall C" }).click();
    await page.getByRole("button", { name: "Delete wall E" }).click();
    await expect(page.locator("[data-room-open]")).toHaveText("Open at C, E");
    await page.getByRole("button", { name: "Close room" }).click();
    await expect(footer(page)).toContainText("Room closed · 8 walls");
    expect(await wallShapes(page)).toEqual(before);

    // An open end still gets the hint and closes as before (the main script's "open by" path).
    await page.getByLabel("Wall B length").fill("2462");
    await page.getByLabel("Wall B length").press("Enter");
    await expect(page.locator("[data-room-open]")).toHaveText("Open by 62 mm");
    await page.getByLabel("Wall B length").fill("2400");
    await page.getByLabel("Wall B length").press("Enter");
    await expect(footer(page)).toContainText("Room closed · 8 walls");

    // A template replaces a room with a gap.
    await page.getByRole("button", { name: "Delete wall C" }).click();
    await page.getByRole("button", { name: /Start from a template/ }).click();
    await page.getByRole("menuitem", { name: "Straight" }).click();
    await page.getByRole("button", { name: "Replace walls" }).click();
    await expect(page.locator("[data-open-wall]")).toHaveCount(0);
    await expect(footer(page)).toContainText("Room closed · 4 walls");
  });

  test("a wall with units: confirm, its units go, the others stay; undo brings it all back", async ({ page }) => {
    await open(page, "/setup");
    await resetDemo(page);
    await loadSample(page);
    const before = await wallShapes(page);
    await page.getByRole("button", { name: "Delete wall B" }).click();
    await page.getByRole("button", { name: "Delete wall and units" }).click();
    await expect(page.locator('[data-open-wall="B"]')).toBeVisible();
    for (const id of ["Wall D", "Wall E", "Wall F", "Wall G", "Wall H"]) expect((await wallShapes(page))[id], id).toEqual(before[id]);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("makwana:project")!).state.project);
    expect(saved.modules.some((m: { wallId: string }) => m.wallId === "B")).toBe(false);
    expect(saved.modules.some((m: { wallId: string }) => m.wallId === "A")).toBe(true);
    expect(saved.room.walls.find((w: { id: string }) => w.id === "B")).toMatchObject({ lengthMm: 2400, heading: "S", open: true });
    await page.getByRole("button", { name: "Undo" }).first().click();
    await expect(page.locator("[data-open-wall]")).toHaveCount(0);
    await expect(page.locator("footer")).toContainText("Room closed · 8 walls");
  });
});

test.describe("Feedback 1 · item 2: choose which wall a unit faces", () => {
  interface Saved {
    id: string;
    moduleCode: string;
    wallId: string;
    offsetMm: number;
  }
  const savedModules = (page: Page): Promise<Saved[]> => page.evaluate(() => JSON.parse(localStorage.getItem("makwana:project")!).state.project.modules);
  const b600 = async (page: Page) => (await savedModules(page)).find((m) => m.moduleCode === "B600");

  /** Screen point of a wall offset and height on the visible elevation. */
  const onWall = (page: Page, wallId: string, offsetMm: number, zMm: number) =>
    page.locator(`[data-elevation="${wallId}"]`).evaluate(
      (svg: SVGSVGElement, [x, z]) => {
        const p = new DOMPoint(x, 2850 - z).matrixTransform(svg.getScreenCTM()!);
        return { x: p.x, y: p.y };
      },
      [offsetMm, zMm] as const,
    );

  /** Drags B600 from the catalogue over wall A near its right end; `whileOver` runs before the drop. */
  async function dragB600(page: Page, whileOver?: () => Promise<void>) {
    await page.getByPlaceholder("Search modules or codes").fill("B600");
    const card = page.locator('[data-module="B600"]');
    const from = (await card.boundingBox())!;
    const to = await onWall(page, "A", 2900, 400);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 6, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.waitForTimeout(60);
    if (whileOver) await whileOver();
    await page.mouse.up();
    await page.waitForTimeout(100);
  }

  async function toDesign(page: Page) {
    await open(page, "/setup");
    await resetDemo(page);
    await stepper(page, "Design").click();
    await expect(page.locator('[data-elevation="A"]')).toBeVisible();
  }

  test("while dragging, R / Shift+R turn it to the next / previous wall, shown before the drop", async ({ page }) => {
    await toDesign(page);
    await dragB600(page, async () => {
      await expect(page.locator("[data-turn-hint]")).toHaveAttribute("data-turn-hint", "A");
      await page.keyboard.press("r");
      // The preview is on wall B: its elevation, the hint and the 3D ghost.
      await expect(page.locator('[data-elevation="B"]')).toBeVisible();
      await expect(page.locator("[data-turn-hint]")).toHaveAttribute("data-turn-hint", "B");
      await page.keyboard.press("r");
      await expect(page.locator('[data-elevation="C"]')).toBeVisible();
      await page.keyboard.press("Shift+R");
      await expect(page.locator('[data-elevation="B"]')).toBeVisible();
      const onB = await onWall(page, "B", 1500, 400);
      await page.mouse.move(onB.x, onB.y, { steps: 4 });
      await page.waitForTimeout(60);
      await page.locator("[data-three-panel]").screenshot({ path: test.info().outputPath("drag-on-b.png") });
    });
    const placed = await b600(page);
    expect(placed?.wallId).toBe("B");
    await expect(page.locator("[data-turn-hint]")).toHaveCount(0);
  });

  test("after placing: R, Shift+R and the turn button; blocked shows the card; undo and redo", async ({ page }) => {
    await toDesign(page);
    await dragB600(page);
    expect(await b600(page)).toMatchObject({ wallId: "A", offsetMm: 2600 });
    await expect(page.locator("[data-turn-button]")).toBeVisible();

    // R: the next wall, in the same (A/B) corner.
    await page.keyboard.press("r");
    await expect.poll(() => b600(page)).toMatchObject({ wallId: "B", offsetMm: 0 });
    await expect(page.locator('[data-elevation="B"]')).toBeVisible();
    await page.keyboard.press("Meta+z");
    await expect.poll(() => b600(page)).toMatchObject({ wallId: "A", offsetMm: 2600 });
    await page.keyboard.press("Meta+Shift+z");
    await expect.poll(() => b600(page)).toMatchObject({ wallId: "B", offsetMm: 0 });

    // Shift+R twice: back to A, then H, into the column in the A/H corner: blocked.
    await page.keyboard.press("Shift+R");
    await expect.poll(() => b600(page)).toMatchObject({ wallId: "A", offsetMm: 2600 });
    await page.keyboard.press("Shift+R");
    const card = page.locator('[data-outcome="blocked"]');
    await expect(card).toBeVisible();
    await expect(page.locator('[data-elevation="H"]')).toBeVisible();
    expect(await b600(page), "nothing moved").toMatchObject({ wallId: "A", offsetMm: 2600 });
    const fixes = card.locator("button").filter({ has: page.locator("svg") });
    await expect(fixes.first()).toHaveText("Move to nearest free spot on Wall H");
    await fixes.first().click();
    await expect.poll(() => b600(page)).toMatchObject({ wallId: "H", offsetMm: 1500 });

    // The turn button on the selected unit does what R does: from H 1500 the next wall is A, where
    // the projected spot (A 0) is the column's: blocked again, and the first fix finds A 300.
    await page.locator("[data-turn-button]").click();
    await expect(card).toBeVisible();
    await expect(fixes.first()).toHaveText("Move to nearest free spot on Wall A");
    await fixes.first().click();
    await expect.poll(() => b600(page)).toMatchObject({ wallId: "A", offsetMm: 300 });
  });

  test("the inspector's Wall picker turns it the same way; walls it doesn't fit aren't offered", async ({ page }) => {
    await toDesign(page);
    await dragB600(page);
    const inspector = page.getByRole("complementary", { name: "Inspector" });
    await inspector.getByRole("combobox", { name: "Wall" }).click();
    // Not D or F (450 mm): too short for a 600 mm unit.
    await expect(page.getByRole("option")).toHaveText(["Wall A", "Wall B", "Wall C", "Wall E", "Wall G", "Wall H"]);
    await page.getByRole("option", { name: "Wall B" }).click();
    await expect.poll(() => b600(page)).toMatchObject({ wallId: "B", offsetMm: 0 });
    await inspector.getByRole("button", { name: "Turn to the next wall" }).click();
    await expect.poll(() => b600(page)).toMatchObject({ wallId: "C" });
  });

  test("no other wall fits: a toast, and it stays", async ({ page }) => {
    await open(page, "/setup");
    await resetDemo(page);
    // A unit as long as wall A (3200), seeded: no other wall is that long.
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("makwana:project")!);
      saved.state.project.modules = [
        { id: "wide", moduleCode: "B600", wallId: "A", layer: "base", offsetMm: 0, widthMm: 3200, carcassId: "bwp", finishId: "matte-sage", shutterTypeId: "standard", hardware: [], isCustomSize: true },
      ];
      localStorage.setItem("makwana:project", JSON.stringify(saved));
    });
    await page.reload();
    await stepper(page, "Design").click();
    await page.locator('[data-elevation="A"] [data-unit="wide"]').click({ position: { x: 40, y: 10 } });
    await page.keyboard.press("r");
    await expect(page.getByText("No other wall fits B600 (3200 mm)")).toBeVisible();
    expect((await savedModules(page))[0]).toMatchObject({ wallId: "A", offsetMm: 0 });
  });
});
