// Dragging catalogue cards onto an elevation, shared by the main script and the focused specs.

import type { Locator, Page } from "@playwright/test";

const ceiling = (page: Page): Promise<number> =>
  page.evaluate(() => JSON.parse(localStorage.getItem("makwana:project")!).state.project.room.ceilingHeightMm);

/** Screen point of a wall offset and height on the visible elevation of `wallId`. */
export async function onWall(page: Page, wallId: string, offsetMm: number, zMm: number) {
  return page.locator(`[data-elevation="${wallId}"]`).evaluate(
    (svg: SVGSVGElement, [x, z, ceiling]) => {
      const p = new DOMPoint(x, ceiling - z).matrixTransform(svg.getScreenCTM()!);
      return { x: p.x, y: p.y };
    },
    [offsetMm, zMm, await ceiling(page)] as const,
  );
}

/**
 * Drags a catalogue card onto an elevation so the unit's centre is at `centreMm` (the screen drops
 * a unit centred on the pointer). `whileOver` runs with the pointer over the wall, before the drop.
 */
export async function dragOnto(page: Page, card: Locator, wallId: string, centreMm: number, zMm: number, whileOver?: () => Promise<void>) {
  await card.scrollIntoViewIfNeeded();
  const from = (await card.boundingBox())!;
  const to = await onWall(page, wallId, centreMm, zMm);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 6, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(60); // one animation frame for the ghost
  if (whileOver) await whileOver();
  await page.mouse.up();
  // dnd-kit swallows clicks for 50 ms after a drop; a person can't click that fast, a test can.
  await page.waitForTimeout(100);
}

export async function searchAndDrag(page: Page, code: string, wallId: string, centreMm: number, zMm: number) {
  await page.getByPlaceholder("Search modules or codes").fill(code);
  await dragOnto(page, page.locator(`[data-module="${code}"]`), wallId, centreMm, zMm);
  await page.getByPlaceholder("Search modules or codes").fill("");
}
