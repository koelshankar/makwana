import { test as base, expect, type Page } from "@playwright/test";

/**
 * Every test fails on any console error or warning, or uncaught page error, on any page it opens.
 * A test that triggers a known browser message on purpose (WebGL context loss) matches it with
 * `allowedConsole`.
 */
export const test = base.extend<{ allowedConsole: RegExp | null; consoleGuard: void }>({
  allowedConsole: [null, { option: true }],
  consoleGuard: [
    async ({ context, allowedConsole }, use) => {
      const problems: string[] = [];
      const watch = (page: Page) => {
        page.on("console", (msg) => {
          if (msg.type() !== "error" && msg.type() !== "warning") return;
          const text = msg.text();
          if (allowedConsole?.test(text)) return;
          problems.push(`[${msg.type()}] ${page.url()} ${text}`);
        });
        page.on("pageerror", (err) => problems.push(`[pageerror] ${page.url()} ${err.message}`));
      };
      context.pages().forEach(watch);
      context.on("page", watch);
      await use();
      expect(problems, "console errors or warnings").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens a screen and waits for the saved project to be restored (no skeleton). */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('[aria-label="Loading project"]')).toHaveCount(0);
}

/** Demo menu → item. */
export async function demoMenu(page: Page, item: string | RegExp) {
  await page.getByRole("button", { name: "Demo menu" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}
