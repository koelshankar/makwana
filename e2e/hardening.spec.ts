// End-to-end checks for the hardening-1 fixes that a browser can show. (Fixes without a browser
// path, such as a store that throws while restoring, are covered by the Vitest suite.)

import type { Locator, Page } from "@playwright/test";
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
  test("shows the unavailable panel while lost; three.js restores and the scene fully redraws", async ({ page }) => {
    await open(page, "/design");
    const panel = page.locator("[data-three-panel]");
    const canvas = panel.locator("canvas[data-scene-ready]");
    // Mid-session: the scene has started and drawn (with its contact shadows) before the context goes.
    await expect(canvas).toHaveCount(1);
    await expect(panel.locator("[data-three-unavailable]")).toHaveCount(0);
    await page.mouse.move(0, 0);
    const before = await settledShot(canvas);
    expect(await compare(page, before), "the 3D view has drawn something").toBeGreaterThan(0.2);

    const sameCanvas = await canvas.evaluate((c: HTMLCanvasElement) => {
      const gl = (c.getContext("webgl2") ?? c.getContext("webgl"))!;
      const ext = gl.getExtension("WEBGL_lose_context")!;
      const w = window as unknown as { __lose: WEBGL_lose_context; __canvas: HTMLCanvasElement };
      w.__lose = ext;
      w.__canvas = c;
      ext.loseContext();
      return true;
    });
    expect(sameCanvas).toBe(true);
    await expect(panel.locator("[data-three-unavailable]")).toBeVisible();
    await expect(panel.getByText("3D view isn't available on this device")).toBeVisible();

    await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
    await expect(panel.locator("[data-three-unavailable]")).toHaveCount(0);
    // Restored in place: the same canvas element, with a working context (no remount).
    expect(await canvas.evaluate((c) => c === (window as unknown as { __canvas: HTMLCanvasElement }).__canvas)).toBe(true);
    expect(await canvas.evaluate((c: HTMLCanvasElement) => !(c.getContext("webgl2") ?? c.getContext("webgl"))!.isContextLost())).toBe(true);

    // A full redraw: the restored frame matches the one before the loss, shadows and edges included.
    // (A restored context starts with an empty drawing buffer, so a missed redraw shows as blank.)
    await expect
      .poll(async () => compare(page, await canvas.screenshot(), before), { timeout: 5000 })
      .toBeLessThan(0.002);
    await canvas.screenshot({ path: test.info().outputPath("after-restore.png") });
  });
});

/** A screenshot taken once two in a row agree (the demand frame loop has finished drawing). */
async function settledShot(target: Locator): Promise<Buffer> {
  let last = await target.screenshot();
  for (let i = 0; i < 20; i++) {
    await target.page().waitForTimeout(150);
    const next = await target.screenshot();
    if (next.equals(last)) return next;
    last = next;
  }
  return last;
}

/**
 * Compares PNGs in the page: the share of pixels of `a` that differ from `b` by more than 8 in any
 * channel, or (without `b`) that differ from the 3D background colour #f1efeb.
 */
async function compare(page: Page, a: Buffer, b?: Buffer): Promise<number> {
  return page.evaluate(
    async ([a64, b64]) => {
      const decode = async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const pa = await decode(a64);
      const pb = b64 ? await decode(b64) : null;
      if (pb && pb.length !== pa.length) return 1;
      const bg = [0xf1, 0xef, 0xeb];
      let n = 0;
      for (let i = 0; i < pa.length; i += 4) {
        for (let k = 0; k < 3; k++) {
          if (Math.abs(pa[i + k] - (pb ? pb[i + k] : bg[k])) > 8) {
            n++;
            break;
          }
        }
      }
      return n / (pa.length / 4);
    },
    [a.toString("base64"), b?.toString("base64") ?? null] as const,
  );
}

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
