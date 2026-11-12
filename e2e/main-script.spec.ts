// The handover brief's section 6 main test script, as the demo is given live: Reset demo to the PDF
// and back, in one page, with no reload. Each `test.step` is a part of the script; each `expect`
// is one of its "Expect" lines. Screenshots of every stage go to the test's output folder.
// The console guard (fixtures.ts) fails the run on any console error or warning.

import type { Locator, Page } from "@playwright/test";
import { demoMenu, expect, open, test } from "./fixtures";

const PERSIST_KEY = "makwana:project";
const QUOTE = "MMK-AND-2026-0147";

interface SavedPlacement {
  id: string;
  moduleCode?: string;
  applianceId?: string;
  wallId?: string;
  offsetMm?: number;
  widthMm?: number;
  finishId?: string;
  hostPlacementId?: string;
}

/** The project as saved in localStorage (written on every change). */
async function saved(page: Page): Promise<{ project: { modules: SavedPlacement[]; appliances: SavedPlacement[]; room: { ceilingHeightMm: number } }; settings: { nextQuoteSeq: number } }> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, PERSIST_KEY);
}

const modulesOf = async (page: Page, code: string) => (await saved(page)).project.modules.filter((m) => m.moduleCode === code);
const rupees = (text: string | null) => Number((text ?? "").replace(/[^\d]/g, ""));
const runningTotal = async (page: Page) => rupees(await page.locator("[data-running-total]").textContent());

/** Screen point of a wall offset and height on the visible elevation of `wallId`. */
async function onWall(page: Page, wallId: string, offsetMm: number, zMm: number) {
  return page.locator(`[data-elevation="${wallId}"]`).evaluate(
    (svg: SVGSVGElement, [x, z, ceiling]) => {
      const p = new DOMPoint(x, ceiling - z).matrixTransform(svg.getScreenCTM()!);
      return { x: p.x, y: p.y };
    },
    [offsetMm, zMm, (await saved(page)).project.room.ceilingHeightMm] as const,
  );
}

/**
 * Drags a catalogue card onto an elevation so the unit's centre is at `centreMm` (the screen drops
 * a unit centred on the pointer). `whileOver` runs with the pointer over the wall, before the drop.
 */
async function dragOnto(page: Page, card: Locator, wallId: string, centreMm: number, zMm: number, whileOver?: () => Promise<void>) {
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

async function searchAndDrag(page: Page, code: string, wallId: string, centreMm: number, zMm: number) {
  await page.getByPlaceholder("Search modules or codes").fill(code);
  await dragOnto(page, page.locator(`[data-module="${code}"]`), wallId, centreMm, zMm);
  await page.getByPlaceholder("Search modules or codes").fill("");
}

/** A screenshot taken once two in a row agree (the 3D view draws on demand). */
async function settledShot(target: Locator): Promise<Buffer> {
  let last = await target.screenshot();
  for (let i = 0; i < 20; i++) {
    await target.page().waitForTimeout(120);
    const next = await target.screenshot();
    if (next.equals(last)) return next;
    last = next;
  }
  return last;
}

test("main script: Reset demo to the PDF and the activity log, no reload", async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  // The print page calls window.print(); count the calls instead of opening the native dialog.
  await context.addInitScript(() => {
    (window as unknown as { __printCalls: number }).__printCalls = 0;
    window.print = () => {
      (window as unknown as { __printCalls: number }).__printCalls++;
    };
  });
  let loads = 0;
  page.on("load", () => loads++);
  let n = 0;
  const shot = (stage: string) => page.screenshot({ path: test.info().outputPath(`${String(++n).padStart(2, "0")}-${stage}.png`) });

  await open(page, "/setup");
  await page.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true));
  const loadsAtStart = loads;
  const threeCanvas = page.locator("[data-three-panel] canvas[data-scene-ready]");

  await test.step("Start: Reset demo", async () => {
    await demoMenu(page, /Reset demo/);
    await page.locator("[data-confirm-reset]").click();
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByText("Demo reset: empty Mehta room")).toBeVisible();
    await expect(page.getByLabel(/^Wall [A-H] length$/)).toHaveCount(8);
    await expect(page.locator("footer")).toContainText("Room closed · 8 walls");
    await expect(page.locator("[data-user]")).toContainText("Rohan Desai");
    await shot("reset");
  });

  await test.step("Room Setup: open the room, close it again, start designing", async () => {
    const wallB = page.getByLabel("Wall B length");
    const start = page.getByRole("button", { name: /Start Designing/ });
    const plan = page.locator("main svg.touch-none");
    const planBefore = await plan.innerHTML();

    await wallB.fill("2462");
    await wallB.press("Enter");
    await expect.poll(() => plan.innerHTML(), { message: "the plan redraws" }).not.toBe(planBefore);
    await expect(plan).toContainText("2462");
    const footer = page.locator("footer");
    await expect(footer).toContainText("Room open · 8 walls");
    await expect(footer.locator('[title*="open by 62 mm"]')).toHaveCount(1);
    await expect(start).toBeDisabled();
    await start.locator("xpath=..").hover();
    await expect(page.getByText("Fix these before designing:")).toBeVisible();
    await shot("room-open");

    await wallB.fill("2400");
    await wallB.press("Enter");
    await expect(footer).toContainText("Room closed · 8 walls");
    await expect(footer).toContainText("Ready for design");
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page).toHaveURL(/\/design$/);
    await expect(threeCanvas).toHaveCount(1);
  });

  await test.step("Design: build an L kitchen on walls A and B", async () => {
    await page.getByRole("tab", { name: "Wall A", exact: true }).click();
    // Each drop is aimed 20-40 mm off its place, so it only lands there by snapping.
    let total = await runningTotal(page);
    await searchAndDrag(page, "HU900", "A", 300 + 450 + 30, 400); // right of the 300 mm column
    await expect.poll(async () => (await modulesOf(page, "HU900")).map((m) => m.offsetMm)).toEqual([300]);
    await expect.poll(() => runningTotal(page)).toBeGreaterThan(total);

    total = await runningTotal(page);
    await searchAndDrag(page, "SU900", "A", 1200 + 450 + 25, 400);
    await expect.poll(async () => (await modulesOf(page, "SU900")).map((m) => m.offsetMm)).toEqual([1200]);
    await expect.poll(() => runningTotal(page)).toBeGreaterThan(total);

    total = await runningTotal(page);
    // The right end of wall A, aimed 20 mm short of it: the wall end wins over SU900's edge, which
    // is also in reach at 1366 (8 px = 87 mm there). M1 in HARDENING.md.
    await searchAndDrag(page, "BC1000", "A", 2200 + 500 - 20, 400);
    await expect.poll(async () => (await modulesOf(page, "BC1000")).map((m) => m.offsetMm)).toEqual([2200]);
    await expect.poll(() => runningTotal(page)).toBeGreaterThan(total);
    await expect(page.locator("[data-checks]")).toHaveAttribute("data-checks", "warning");
    await expect(page.locator("[data-outcome=warning]")).toContainText(/100 mm gap between SU900 and BC1000/);
    await shot("wall-a-base");

    await page.getByRole("tab", { name: "Wall B", exact: true }).click();
    await searchAndDrag(page, "BD600", "B", 560 + 300 + 30, 400);
    await expect.poll(async () => (await modulesOf(page, "BD600")).map((m) => m.offsetMm)).toEqual([560]);
    await searchAndDrag(page, "BD600", "B", 1160 + 300 + 30, 400);
    await expect.poll(async () => (await modulesOf(page, "BD600")).map((m) => m.offsetMm).sort((a, b) => a! - b!)).toEqual([560, 1160]);
    await shot("wall-b-base");
  });

  await test.step("Design: trigger and fix a block", async () => {
    await page.getByRole("tab", { name: "Wall A", exact: true }).click();
    const count = (await saved(page)).project.modules.length;
    await searchAndDrag(page, "T600OM", "A", 1750, 1200); // onto the window (1300-2200)
    const card = page.locator("[data-outcome=blocked]");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Blocked");
    await expect(card.locator("h3")).toContainText(/tall unit/i);
    await expect(card.locator("h3")).toContainText(/window/i);
    await expect(card).toContainText("+1 more blocking issue");
    expect((await saved(page)).project.modules.length, "nothing is placed").toBe(count);
    const fix = card.getByRole("button", { name: "Move to Wall B, 1760–2360 mm" });
    await expect(fix).toBeVisible();
    await shot("blocked");

    await fix.click();
    await expect.poll(async () => (await modulesOf(page, "T600OM")).map((m) => `${m.wallId}@${m.offsetMm}`)).toEqual(["B@1760"]);
    await expect(page.getByRole("tab", { name: "Wall B", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-checks]")).toContainText("2 warnings");
    await page.locator("[data-checks]").click();
    const popover = page.locator("[data-checks-popover]");
    await expect(popover.locator("[data-checks-state=ready]")).toBeVisible();
    await expect(popover.locator("[data-check-row][data-status=warning]").filter({ hasText: /40 mm gap/ })).toHaveCount(1);
    await expect(popover.locator("[data-check-row]").filter({ hasText: /40 mm gap/ })).toContainText("Wall B");
    await shot("tall-moved");
  });

  await test.step("Design: fix a gap with a filler", async () => {
    const popover = page.locator("[data-checks-popover]");
    const row = popover.locator("[data-check-row]").filter({ hasText: "100 mm gap between SU900 and BC1000" });
    await expect(row).toContainText("Wall A");
    await row.getByRole("button").first().click();
    await row.getByRole("button", { name: "Add a 100 mm filler" }).click();
    await expect.poll(async () => (await modulesOf(page, "FIL")).map((m) => `${m.wallId}@${m.offsetMm}+${m.widthMm}`)).toEqual(["A@2100+100"]);
    await expect(page.locator("[data-checks]")).toHaveText(/^1 warning/);
    await expect(popover.locator("[data-check-row]")).toHaveCount(1);
    await expect(popover.locator("[data-check-row]")).toContainText(/40 mm gap/);
    await expect(popover.locator("[data-check-row]")).toHaveAttribute("data-status", "warning");
    await expect(page.getByRole("button", { name: /Review Quote/ })).toBeEnabled();
    await shot("filler");
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
  });

  await test.step("Design: appliances", async () => {
    await page.getByRole("tab", { name: "Appliances" }).click();
    await page.getByRole("tab", { name: "Wall A", exact: true }).click();
    const modules = (await saved(page)).project.modules;
    const id = (code: string) => modules.find((m) => m.moduleCode === code)!.id;
    const before3d = await settledShot(threeCanvas);

    // Each drop must land (it is checked, then committed and selected) before the next step.
    const placed = (n: number) => expect.poll(async () => (await saved(page)).project.appliances.length).toBe(n);
    // Valid hosts glow green while a sink, hob or oven is dragged over the wall.
    await dragOnto(page, page.locator("[data-appliance=sink]"), "A", 1650, 450, async () => {
      await expect(page.locator(`[data-elevation=A] [data-host="${id("SU900")}"]`)).toHaveCount(1);
    });
    await placed(1);
    await expect(page.locator("[data-elevation=A] [data-host]")).toHaveCount(0);
    await dragOnto(page, page.locator("[data-appliance=hob]"), "A", 750, 450, async () => {
      await expect(page.locator(`[data-elevation=A] [data-host="${id("HU900")}"]`)).toHaveCount(1);
    });
    await placed(2);
    await dragOnto(page, page.locator("[data-appliance=chimney]"), "A", 750, 1900);
    await placed(3);
    await page.getByRole("tab", { name: "Wall B", exact: true }).click();
    await dragOnto(page, page.locator("[data-appliance=oven]"), "B", 2060, 900, async () => {
      await expect(page.locator(`[data-elevation=B] [data-host="${id("T600OM")}"]`)).toHaveCount(1);
    });
    await placed(4);
    await dragOnto(page, page.locator("[data-appliance=microwave]"), "B", 2060, 1500);
    await placed(5);
    await expect(page.locator("[data-outcome=blocked]"), "no drop is blocked").toHaveCount(0);

    const appliances = (await saved(page)).project.appliances;
    const host = (a: string) => appliances.find((x) => x.applianceId === a)?.hostPlacementId;
    expect(host("sink")).toBe(id("SU900"));
    expect(host("hob")).toBe(id("HU900"));
    expect(host("oven")).toBe(id("T600OM"));
    expect(host("microwave")).toBe(id("T600OM"));
    const chimney = appliances.find((x) => x.applianceId === "chimney");
    expect(chimney && `${chimney.wallId}@${chimney.offsetMm}`, "chimney above the hob").toBe("A@300");
    await expect(page.locator("footer")).toContainText("5 appliances");

    // Cut-outs: elevation, plan and 3D.
    await page.getByRole("tab", { name: "Wall A", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Wall A", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Wall B", exact: true })).toHaveAttribute("aria-selected", "false");
    await page.mouse.move(0, 0);
    await expect(page.locator("[data-elevation=A]")).toContainText("Sink cut-out");
    await expect(page.locator("[data-elevation=A]")).toContainText("Hob cut-out");
    await shot("appliances-elevation");
    await page.getByRole("tab", { name: "Plan", exact: true }).click();
    await expect(page.locator("[data-cutout=sink]")).toHaveCount(1);
    await expect(page.locator("[data-cutout=hob]")).toHaveCount(1);
    await shot("appliances-plan");
    // 3D: Level 1 has no way to inspect meshes from outside, so this checks the picture changed.
    expect((await settledShot(threeCanvas)).equals(before3d), "the 3D view shows the appliances").toBe(false);
    await page.getByRole("tab", { name: "Wall A", exact: true }).click();
  });

  await test.step("Design: finishes", async () => {
    const hu = (await modulesOf(page, "HU900"))[0];
    const unit = page.locator(`[data-elevation=A] [data-unit="${hu.id}"]`).first();
    const tint = unit.locator("[data-finish-tint]");
    const at = await onWall(page, "A", 750, 150); // low on the unit, below the hob
    await page.mouse.click(at.x, at.y);
    const inspector = page.getByRole("complementary", { name: "Inspector" });
    await expect(inspector).toContainText("HU900");
    // Selected shows as an outline: the finish tint stays (M2).
    await expect(tint).toHaveAttribute("data-finish-tint", hu.finishId!);
    const tintBefore = await tint.getAttribute("fill");
    const threeBefore = await settledShot(threeCanvas);
    const totalBefore = await runningTotal(page);
    const unitPriceBefore = await page.locator("[data-unit-price]").textContent();

    await inspector.getByRole("radiogroup", { name: "Finish" }).getByRole("radio", { checked: false }).first().click();
    await expect.poll(async () => (await modulesOf(page, "HU900"))[0].finishId).not.toBe(hu.finishId);
    const newFinish = (await modulesOf(page, "HU900"))[0].finishId!;
    // Elevation, 3D and price together, with the unit still selected.
    await expect(inspector).toContainText("HU900");
    await expect(tint, "the elevation changes").toHaveAttribute("data-finish-tint", newFinish);
    expect(await tint.getAttribute("fill")).not.toBe(tintBefore);
    await expect.poll(async () => (await settledShot(threeCanvas)).equals(threeBefore), { message: "the 3D view changes" }).toBe(false);
    await expect.poll(() => runningTotal(page), { message: "the price changes" }).not.toBe(totalBefore);
    await expect(page.locator("[data-unit-price]")).not.toHaveText(unitPriceBefore!);
    const delta = rupees(await page.locator("[data-delta]").textContent());
    expect(delta, "the footer shows the price change").toBe(Math.abs((await runningTotal(page)) - totalBefore));
    await shot("finish");
    await page.keyboard.press("Escape");
    await expect(inspector).not.toContainText("HU900");
    await expect(tint).toHaveAttribute("data-finish-tint", newFinish);
  });

  await test.step("Design: customer view", async () => {
    const panel = page.locator("[data-three-panel]");
    const footerBefore = await page.locator("footer").innerText();
    const projectBefore = JSON.stringify((await saved(page)).project);

    const enter = async () => {
      await page.getByRole("button", { name: "Show customer" }).click();
      await expect(panel).toHaveAttribute("data-customer", "true");
      const box = (await panel.boundingBox())!;
      const vp = page.viewportSize()!;
      expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, vp.width, vp.height]);
      await expect(panel.locator("h2")).toHaveText("Mehta Residence");
      await expect(panel.getByRole("radiogroup", { name: "Wall height" })).toBeVisible();
      await expect(panel.getByRole("radiogroup", { name: "View" })).toBeVisible();
      // Only view controls: wall height, presets, rotate, zoom, reset, Exit.
      const buttons = await panel.locator("button:visible").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim()));
      expect(buttons.filter((b) => !/^(Cut at 450|Full height|3D|Top|Facing [A-H]|Rotate left|Rotate right|Zoom out|Zoom in|Reset view|Exit)$/.test(b ?? "")), "no controls beyond the view").toEqual([]);
    };

    await enter();
    await shot("customer-view");
    await page.keyboard.press("Escape");
    await expect(panel).not.toHaveAttribute("data-customer", "true");
    // A real Esc also leaves browser full screen; a synthetic key press doesn't.
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());

    await enter();
    await panel.getByRole("button", { name: "Exit" }).click();
    await expect(panel).not.toHaveAttribute("data-customer", "true");
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    expect(await page.locator("footer").innerText(), "nothing changed").toBe(footerBefore);
    expect(JSON.stringify((await saved(page)).project), "nothing changed").toBe(projectBefore);
    await page.getByRole("button", { name: /Review Quote/ }).click();
    await expect(page).toHaveURL(/\/quote$/);
  });

  await test.step("Quote: header, discount, approval", async () => {
    const title = page.locator("[data-quote-title]");
    await expect(title).toHaveText("Draft quote · Version 1");
    await expect(page.locator("[data-status-pill]")).toHaveAttribute("data-status-pill", "draft");
    await expect(page.locator("[data-status-pill]")).toHaveText("Draft");
    await expect(page.locator("main")).not.toContainText("MMK-");
    await shot("quote-draft");

    const grand = page.locator("[data-quote-grand-total]");
    const before = rupees(await grand.textContent());
    await page.getByLabel("Discount percent").fill("8");
    await page.getByLabel("Discount percent").press("Enter");
    await expect(page.locator("[data-discount-note]")).toHaveText("above 5% · needs approval");
    await expect.poll(async () => rupees(await grand.textContent())).toBeLessThan(before);
    expect(rupees(await page.locator("[data-quote-header-total]").textContent())).toBe(rupees(await grand.textContent()));

    await page.getByRole("button", { name: "Send for Approval" }).click();
    await expect(title).toHaveText(`Quote ${QUOTE} · Version 1`);
    await expect(page.locator("[data-status-pill]")).toHaveText("Pending manager approval");

    await demoMenu(page, /Switch to Manager/);
    await expect(page.getByRole("status").filter({ hasText: "Waiting for your approval" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send back" })).toBeVisible();
    await shot("manager");

    await page.getByRole("button", { name: "Approve" }).click();
    await demoMenu(page, /Switch to Salesperson/);
    await expect(page.locator("[data-status-pill]")).toHaveText("Approved");
    await expect(page.locator("[data-quote-checks]")).toContainText("Approved by Store Manager");
    await shot("approved");
  });

  await test.step("Quote: share and PDF", async () => {
    const grand = (await page.locator("[data-quote-grand-total]").textContent())!;
    await page.locator("[data-share]").click();
    const dialog = page.locator("[data-share-dialog]");
    await dialog.getByRole("button", { name: "Copy WhatsApp message" }).click();
    await expect(page.getByText("WhatsApp message copied")).toBeVisible();
    const pasted = await page.evaluate(() => navigator.clipboard.readText());
    expect(pasted).toContain(QUOTE);
    expect(pasted).toContain(grand);
    await shot("share");

    // "Shared twice" in the activity log: the copy, and Download PDF (here from the dialog; the
    // footer's button logs the same, see focused.spec.ts). Exactly two, so nothing logs twice.
    await dialog.getByRole("button", { name: "Download PDF" }).click();
    await expect(page).toHaveURL(/\/quote\/print\?auto=1$/);
    await expect(page.locator("[data-print-ready]")).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls), { message: "the print dialog opens" }).toBe(1);
    await expect(page.locator("body")).toContainText(QUOTE);
    await expect(page.locator("body")).toContainText("Approved · by Store Manager");
    await expect(page.locator("[data-watermark]")).toHaveCount(0);
    await expect(page.locator("[data-print-3d]")).toHaveAttribute("src", /^data:image\/png;base64,/);
    expect(await page.locator("[data-print-3d]").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator("[data-print-plan] [data-cutout]"), "the plan, with its cut-outs").toHaveCount(2);
    await expect(page.locator("[data-print-elevation-section=A] [data-print-elevation]")).toHaveCount(1);
    await expect(page.locator("[data-print-elevation-section=B] [data-print-elevation]")).toHaveCount(1);
    for (const code of ["HU900", "SU900", "BC1000", "BD600", "T600OM"]) await expect(page.locator("body")).toContainText(code);
    await expect(page.locator("[data-print-totals]")).toContainText(grand);
    await page.screenshot({ path: test.info().outputPath(`${String(++n).padStart(2, "0")}-pdf.png`), fullPage: true });
    // As printed: the toast from the copy and the screen-only controls stay off the PDF.
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("[data-sonner-toaster]")).toBeHidden();
    await expect(page.getByRole("link", { name: "Back to the quote" })).toBeHidden();
    await expect(page.locator("[data-print-3d]")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`${String(++n).padStart(2, "0")}-pdf-print-media.png`), fullPage: true });
    await page.emulateMedia({ media: "screen" });
  });

  await test.step("Quote: back to the quote, Activity", async () => {
    await page.getByRole("link", { name: "Back to the quote" }).click();
    await expect(page).toHaveURL(/\/quote$/);
    await page.locator("[data-activity-log] > button").click();
    const entries = page.locator("[data-activity]");
    await expect(entries).toHaveCount(6);
    const actions = await entries.evaluateAll((li) => li.map((e) => (e as HTMLElement).dataset.activity).reverse());
    expect(actions).toEqual(["discount_changed", "quote_created", "sent_for_approval", "approved", "shared", "shared"]);
    for (const text of await entries.allInnerTexts()) expect(text).toMatch(/\b\d{2}:\d{2}:\d{2}\b/);
    await shot("activity");
  });

  // One quote number used, and still the page the script started on.
  expect((await saved(page)).settings.nextQuoteSeq).toBe(148);
  expect(loads, "no reload").toBe(loadsAtStart);
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
});
