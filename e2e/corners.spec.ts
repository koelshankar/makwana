// Feedback 2, item 4: the inside-corner rules, on the Mehta room's A/B corner (A's far end, B's start).
// a) a front hidden behind a neighbour's side: Blocked, "Move clear of corner".
// b) handles clashing where two fronts meet: Blocked with a tall unit, a warning otherwise; "Add corner filler".

import type { Page } from "@playwright/test";
import { searchAndDrag } from "./drag";
import { demoMenu, expect, open, test } from "./fixtures";

interface Saved {
  id: string;
  moduleCode: string;
  wallId: string;
  offsetMm: number;
  widthMm: number;
}

const stepper = (page: Page, step: "Design" | "Quote") => page.locator("header").getByRole("link", { name: new RegExp(`${step}$`) });
const modules = (page: Page): Promise<Saved[]> => page.evaluate(() => JSON.parse(localStorage.getItem("makwana:project")!).state.project.modules);
const where = async (page: Page) => (await modules(page)).map((m) => `${m.moduleCode}@${m.wallId}${m.offsetMm}+${m.widthMm}`).sort();

const placed = (id: string, moduleCode: string, wallId: string, layer: string, offsetMm: number, widthMm: number, extra: object = {}) => ({
  id,
  moduleCode,
  wallId,
  layer,
  offsetMm,
  widthMm,
  carcassId: "bwp",
  finishId: "matte-sage",
  shutterTypeId: "standard",
  hardware: [],
  isCustomSize: false,
  ...extra,
});

/** The empty Mehta room with these units already placed, open on the Design screen at `wallId`. */
async function designWith(page: Page, units: object[], wallId: string) {
  await open(page, "/setup");
  await demoMenu(page, /Reset demo/);
  await page.locator("[data-confirm-reset]").click();
  await expect(page.getByText("Demo reset: empty Mehta room")).toBeVisible();
  await page.evaluate((list) => {
    const saved = JSON.parse(localStorage.getItem("makwana:project")!);
    saved.state.project.modules = list;
    localStorage.setItem("makwana:project", JSON.stringify(saved));
  }, units);
  await page.reload();
  await stepper(page, "Design").click();
  await page.getByRole("tab", { name: `Wall ${wallId}`, exact: true }).click();
  await expect(page.locator(`[data-elevation="${wallId}"]`)).toBeVisible();
}

const BC1000 = placed("bc", "BC1000", "A", "base", 2200, 1000, { blindSide: "right" });

test.describe("Feedback 2 · item 4: inside corners", () => {
  test("a) a front behind a neighbour's side is blocked; Move clear of corner places it clear", async ({ page }) => {
    await designWith(page, [placed("nb", "B600", "B", "base", 560, 600)], "A");
    await searchAndDrag(page, "B600", "A", 2600 + 300 + 30, 400); // snaps to the corner end of wall A
    const card = page.locator("[data-outcome=blocked]");
    await expect(card).toBeVisible();
    await expect(card.locator("h3")).toHaveText("B600's front is behind the side of B600 at the corner of Wall A and Wall B.");
    await expect(card).toContainText("560 mm of it can't open");
    expect(await where(page), "nothing is placed").toEqual(["B600@B560+600"]);
    const fixes = card.getByRole("button").filter({ hasNot: page.getByText("Cancel") });
    await expect(fixes.first()).toHaveText("Move clear of corner");
    await page.screenshot({ path: test.info().outputPath("hidden-front.png") });

    await fixes.first().click();
    // Clear of the side (560 mm) and of the handles (50 mm): 3200 - 610 - 600.
    await expect.poll(() => where(page)).toEqual(["B600@A1990+600", "B600@B560+600"]);
    await expect(card).toHaveCount(0);
    await expect(page.locator("[data-checks]")).toHaveAttribute("data-checks", "ok");
  });

  test("b) a tall unit whose doors meet a blind corner's is blocked; Add corner filler places it", async ({ page }) => {
    await designWith(page, [BC1000], "B");
    await searchAndDrag(page, "T600OM", "B", 560 + 300 + 30, 1200);
    const card = page.locator("[data-outcome=blocked]");
    await expect(card).toBeVisible();
    await expect(card.locator("h3")).toHaveText("Handles clash where BC1000 and T600OM meet at the corner of Wall A and Wall B.");
    await expect(card).toContainText("The fronts need 50 mm between them");
    expect(await where(page), "nothing is placed").toEqual(["BC1000@A2200+1000"]);
    await page.screenshot({ path: test.info().outputPath("tall-clash.png") });

    await card.getByRole("button", { name: "Add corner filler" }).click();
    await expect.poll(() => where(page)).toEqual(["BC1000@A2150+1000", "FIL@A3150+50", "T600OM@B560+600"]);
    await expect(card).toHaveCount(0);
  });

  test("b) a base unit there is placed with a warning; Add corner filler fixes it and the quote shows the filler", async ({ page }) => {
    await designWith(page, [BC1000], "B");
    await searchAndDrag(page, "BD600", "B", 560 + 300 + 30, 400);
    await expect.poll(() => where(page)).toEqual(["BC1000@A2200+1000", "BD600@B560+600"]);
    const note = page.locator("[data-outcome=warning]");
    await expect(note).toContainText("Handles clash where BC1000 and BD600 meet at the corner of Wall A and Wall B.");
    await expect(page.locator("[data-checks]")).toHaveAttribute("data-checks", "warning");

    await note.getByRole("button", { name: "Add corner filler" }).click();
    await expect.poll(() => where(page)).toEqual(["BC1000@A2150+1000", "BD600@B560+600", "FIL@A3150+50"]);
    await expect(page.locator("[data-checks]")).toHaveAttribute("data-checks", "ok");

    await stepper(page, "Quote").click();
    const filler = page.locator("[data-quote-group=base] [data-quote-line]").filter({ hasText: "Filler panel" });
    await expect(filler).toHaveCount(1);
    await expect(filler).toContainText("Wall A");
    await expect(filler).toContainText("50 × 720 × 20");
  });

  test("a base unit next to a wall unit at a corner: no clash", async ({ page }) => {
    await designWith(page, [placed("ba", "B600", "A", "base", 2600, 600)], "B");
    await searchAndDrag(page, "W600", "B", 300 + 30, 1700); // right into the corner, above the base unit's band
    await expect.poll(() => where(page)).toEqual(["B600@A2600+600", "W600@B0+600"]);
    await expect(page.locator("[data-outcome=blocked]")).toHaveCount(0);
    await expect(page.locator("[data-outcome=warning]")).toHaveCount(0);
    await expect(page.locator("[data-checks]")).toHaveAttribute("data-checks", "ok");
  });
});
