// One tab at a time. Every tab saves the whole project to the same localStorage key, so two tabs
// overwrite each other (and can issue the same quote number). Tabs announce themselves on a
// BroadcastChannel; the oldest tab keeps the demo and any newer tab is blocked.
//
// Pure: the channel is passed in, so the protocol is unit-tested with a fake one.

export interface TabInfo {
  id: string;
  /** When the page loaded (performance.timeOrigin): a reloaded tab counts as new. */
  startedAt: number;
}

type Message = { type: "hello" | "here"; tab: TabInfo };

export interface TabChannel {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (e: { data: unknown }) => void): void;
}

export const TAB_CHANNEL = "makwana:tabs";

/** True when `a` opened before `b` (ties broken by id, so exactly one tab wins). */
export const openedBefore = (a: TabInfo, b: TabInfo) => a.startedAt < b.startedAt || (a.startedAt === b.startedAt && a.id < b.id);

function isMessage(v: unknown): v is Message {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Partial<Message>;
  return (m.type === "hello" || m.type === "here") && typeof m.tab?.id === "string" && typeof m.tab?.startedAt === "number";
}

export interface TabGuard {
  isBlocked(): boolean;
  subscribe(listener: () => void): () => void;
}

/**
 * Says hello on the channel. A tab that is in use answers a newer tab's hello; a tab that hears
 * from an older one is blocked. Blocked tabs stay quiet, so once the tab in use is closed, a
 * reloaded or new tab gets the demo again.
 */
export function createTabGuard(channel: TabChannel, me: TabInfo): TabGuard {
  let blocked = false;
  const listeners = new Set<() => void>();
  channel.addEventListener("message", ({ data }) => {
    if (!isMessage(data) || data.tab.id === me.id) return;
    if (openedBefore(data.tab, me)) {
      if (blocked) return;
      blocked = true;
      listeners.forEach((l) => l());
      return;
    }
    if (data.type === "hello" && !blocked) channel.postMessage({ type: "here", tab: me } satisfies Message);
  });
  channel.postMessage({ type: "hello", tab: me } satisfies Message);
  return {
    isBlocked: () => blocked,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
