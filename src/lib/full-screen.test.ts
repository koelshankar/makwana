import { describe, expect, it, vi } from "vitest";
import { leaveBrowserFullscreen, requestBrowserFullscreen } from "./full-screen";

const doc = (request?: () => Promise<void>, inFullscreen = false) => {
  const exitFullscreen = vi.fn(() => Promise.resolve());
  return { fullscreenElement: inFullscreen ? ({} as Element) : null, documentElement: { requestFullscreen: request }, exitFullscreen };
};

describe("requestBrowserFullscreen", () => {
  it("resolves true when the browser grants it", async () => {
    await expect(requestBrowserFullscreen(doc(() => Promise.resolve()))).resolves.toBe(true);
  });

  it("a refusal ('not granted', the old button's uncaught error) resolves false instead of rejecting", async () => {
    const refused = doc(() => Promise.reject(new TypeError("Permissions check failed: not granted")));
    await expect(requestBrowserFullscreen(refused)).resolves.toBe(false);
  });

  it("no full-screen API, or one that throws, resolves false", async () => {
    await expect(requestBrowserFullscreen(doc(undefined))).resolves.toBe(false);
    await expect(
      requestBrowserFullscreen(
        doc(() => {
          throw new Error("blocked");
        }),
      ),
    ).resolves.toBe(false);
  });
});

describe("leaveBrowserFullscreen", () => {
  it("exits only when the page is in full screen, and swallows a failure", async () => {
    const out = doc(undefined, false);
    leaveBrowserFullscreen(out);
    expect(out.exitFullscreen).not.toHaveBeenCalled();
    const inside = doc(undefined, true);
    leaveBrowserFullscreen(inside);
    expect(inside.exitFullscreen).toHaveBeenCalledOnce();
    const failing = { ...doc(undefined, true), exitFullscreen: vi.fn(() => Promise.reject(new Error("no"))) };
    expect(() => leaveBrowserFullscreen(failing)).not.toThrow();
  });
});
