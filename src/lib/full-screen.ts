// The browser's full screen, asked for politely: browsers may refuse it (embedded and preview
// browsers, iframes without allow="fullscreen", an unfocused window, automation) or not have it.
// A refusal is expected, never an error: the caller's own full-window view stays up regardless.

type FullscreenDoc = Pick<Document, "fullscreenElement"> & {
  documentElement: { requestFullscreen?: () => Promise<void> };
  exitFullscreen?: () => Promise<void>;
};

/** Asks for browser full screen on the whole page. Call it inside the click. Never throws or rejects. */
export function requestBrowserFullscreen(doc: FullscreenDoc = document): Promise<boolean> {
  try {
    const request = doc.documentElement.requestFullscreen?.();
    if (!request) return Promise.resolve(false);
    return request.then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/** Leaves browser full screen if the page is in it. Never throws or rejects. */
export function leaveBrowserFullscreen(doc: FullscreenDoc = document): void {
  if (!doc.fullscreenElement || !doc.exitFullscreen) return;
  doc.exitFullscreen().catch(() => {});
}
