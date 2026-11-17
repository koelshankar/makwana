// Feedback 2, item 1: start a new wall from any free end, by clicking it on the Room Setup plan.
// Free ends only (no branches); a wall joins another only when it closes its own gap exactly.

import type { Page } from "@playwright/test";
import { demoMenu, expect, open, test } from "./fixtures";

const footer = (page: Page) => page.locator("footer");
const start = (page: Page) => page.locator("[data-wall-start]");
const savedWalls = (page: Page): Promise<{ id: string; heading: string; lengthMm: number; open?: true }[]> =>
  page.evaluate(() => JSON.parse(localStorage.getItem("makwana:project")!).state.project.room.walls);

/** Each standing wall's polygon in the plan (world mm), keyed by wall. */
const wallShapes = (page: Page) =>
  page.locator('svg[aria-label="Room plan"] polygon:has(title)').evaluateAll((ps) =>
    Object.fromEntries(ps.map((p) => [p.querySelector("title")!.textContent!.split(" ·")[0], p.getAttribute("points")!.split(" ")])),
  );

/** The empty Mehta room with Wall C deleted (a 1600 mm gap between B and D), adding walls. */
async function gapAtC(page: Page) {
  await open(page, "/setup");
  await demoMenu(page, /Reset demo/);
  await page.locator("[data-confirm-reset]").click();
  await expect(page.getByText("Demo reset: empty Mehta room")).toBeVisible();
  const before = await wallShapes(page);
  await page.getByRole("button", { name: "Delete wall C" }).click();
  await expect(page.locator('[data-open-wall="C"]')).toBeVisible();
  await page.getByRole("button", { name: "Add wall", exact: true }).click();
  return before;
}

async function draw(page: Page, direction: "North" | "East" | "South" | "West", lengthMm: number) {
  await page.getByRole("button", { name: direction, exact: true }).click();
  const length = page.getByLabel("New wall length");
  await length.fill(String(lengthMm));
  await length.press("Enter");
  await expect(page.locator("[data-wall-preview]")).toHaveCount(1);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

test.describe("Feedback 2 · item 1: start a wall from a free end", () => {
  test("click a free end and draw: the wall starts there and nothing else moves", async ({ page }) => {
    const before = await gapAtC(page);
    // Handles at the two free ends only; by default the next wall starts at the first (B's end).
    const handles = page.locator("[data-free-end]");
    expect(await handles.evaluateAll((els) => els.map((e) => e.getAttribute("data-free-end")))).toEqual(["B:end", "D:start"]);
    await expect(start(page)).toHaveAttribute("data-wall-start", "B:end");
    await expect(page.locator('[data-free-end="B:end"]')).toHaveAttribute("data-current", "true");
    // Ends are named by what meets them, not by the drawing direction ("start" / "end").
    await expect(page.locator("[data-wall-start-text]")).toHaveText("Wall I · from Wall B's free end · pick a direction and type its length");
    expect(await handles.evaluateAll((els) => els.map((e) => [e.getAttribute("aria-label"), e.querySelector("title")?.textContent]))).toEqual([
      ["Start from Wall B's free end", "Start from Wall B's free end"],
      ["Start from Wall D's free end", "Start from Wall D's free end"],
    ]);

    await page.locator('[data-free-end="D:start"]').click();
    await expect(start(page)).toHaveAttribute("data-wall-start", "D:start");
    await expect(page.locator("[data-wall-start-text]")).toHaveText("Wall I · from Wall D's free end · pick a direction and type its length");
    await draw(page, "East", 600);
    await page.locator("main").screenshot({ path: test.info().outputPath("drawn-from-d.png") });

    // In the list between the gap and D, stored travelling back to D's start.
    const walls = await savedWalls(page);
    expect(walls.map((w) => w.id)).toEqual(["A", "B", "C", "I", "D", "E", "F", "G", "H"]);
    expect(walls[3]).toMatchObject({ id: "I", heading: "W", lengthMm: 600 });
    const after = await wallShapes(page);
    // It runs from 600 mm east of D's start to D's start (1600, 2400), on the room's face.
    expect(after["Wall I"].slice(0, 2)).toEqual(["2200,2400", "1600,2400"]);
    for (const id of ["Wall A", "Wall E", "Wall F", "Wall G", "Wall H"]) expect(after[id], id).toEqual(before[id]);
    for (const id of ["Wall B", "Wall D"]) expect(after[id].slice(0, 2), id).toEqual(before[id].slice(0, 2));
    // The next wall would start from the new wall's far end; the gap left is 1000 mm.
    await expect(start(page)).toHaveAttribute("data-wall-start", "I:start");
    await expect(page.locator("[data-wall-start-text]")).toHaveText("Wall J · from Wall I's free end · pick a direction and type its length");
    await expect(footer(page)).toContainText("The room is open between Wall B and Wall I (1000 mm).");
    // Esc goes back to the default end.
    await page.keyboard.press("Escape");
    await expect(start(page)).toHaveAttribute("data-wall-start", "B:end");
  });

  test("a wall with both ends free: they are told apart by the side of the plan they are on", async ({ page }) => {
    await gapAtC(page);
    await page.getByRole("button", { name: "Delete wall E" }).click();
    await expect(page.locator('[data-open-wall="E"]')).toBeVisible();
    // Wall D (drawn north) stands alone between the two gaps: its start is at the bottom of the plan.
    const bottom = page.locator('[data-free-end="D:start"]');
    const top = page.locator('[data-free-end="D:end"]');
    await expect(bottom).toHaveAttribute("aria-label", "Start from Wall D's free end (bottom)");
    await expect(bottom.locator("title")).toHaveText("Start from Wall D's free end (bottom)");
    await expect(top).toHaveAttribute("aria-label", "Start from Wall D's free end (top)");
    expect((await bottom.boundingBox())!.y, "the (bottom) end is lower on screen").toBeGreaterThan((await top.boundingBox())!.y);
    await bottom.click();
    await expect(page.locator("[data-wall-start-text]")).toHaveText("Wall I · from Wall D's free end (bottom) · pick a direction and type its length");
  });

  test("click a joined end: no handle there, nothing happens", async ({ page }) => {
    await gapAtC(page);
    const walls = await savedWalls(page);
    // The A/B corner, where two walls meet.
    const corner = await page.locator('svg[aria-label="Room plan"]').evaluate((svg: SVGSVGElement) => {
      const p = new DOMPoint(3200, 0).matrixTransform(svg.getScreenCTM()!);
      return { x: p.x, y: p.y };
    });
    await page.mouse.move(corner.x, corner.y);
    await expect(page.locator("[data-free-end]")).toHaveCount(2);
    await page.mouse.click(corner.x, corner.y);
    await expect(start(page)).toHaveAttribute("data-wall-start", "B:end");
    await expect(page.locator("[data-free-end][data-current]")).toHaveAttribute("data-free-end", "B:end");
    expect(await savedWalls(page)).toEqual(walls);
  });

  test("close a gap exactly: the walls join and the room is ready; tabs follow room order", async ({ page }) => {
    const before = await gapAtC(page);
    await draw(page, "West", 1600); // from B's end, right to D's start
    await expect(footer(page)).toContainText("Room closed · 8 walls");
    await expect(page.locator("[data-open-wall]")).toHaveCount(0);
    await expect(page.locator("[data-free-end]")).toHaveCount(0);
    await expect(page.locator("[data-wall-start-text]")).toHaveText("The room is closed. Delete a wall to open it.");
    expect((await savedWalls(page)).map((w) => `${w.id}${w.heading}${w.lengthMm}`)).toEqual(["AE3200", "BS2400", "IW1600", "DN450", "EW600", "FS450", "GW1000", "HN2400"]);
    // Exactly the old Wall C's place, so every wall's outline is as before.
    const after = await wallShapes(page);
    const { "Wall C": c, ...rest } = before;
    expect(after["Wall I"]).toEqual(c);
    for (const [id, shape] of Object.entries(rest)) expect(after[id], id).toEqual(shape);

    const startDesigning = page.getByRole("button", { name: "Start Designing" });
    await expect(startDesigning).toBeEnabled();
    await startDesigning.click();
    await expect(page).toHaveURL(/\/design$/);
    const tabs = page.getByRole("tab", { name: /^Wall [A-Z]$/ });
    await expect(tabs).toHaveText(["Wall A", "Wall B", "Wall I", "Wall D", "Wall E", "Wall F", "Wall G", "Wall H"]);
  });
});
