import { describe, expect, it } from "vitest";
import { createTabGuard, openedBefore, type TabChannel } from "./tab-guard";

/** An in-memory BroadcastChannel: delivers to every other member, never back to the sender. */
function bus() {
  const members: { channel: TabChannel; listeners: ((e: { data: unknown }) => void)[]; open: boolean }[] = [];
  return {
    join() {
      const member = { listeners: [] as ((e: { data: unknown }) => void)[], open: true, channel: null as unknown as TabChannel };
      member.channel = {
        postMessage: (data) => {
          for (const m of members) if (m !== member && m.open) m.listeners.forEach((l) => l({ data: structuredClone(data) }));
        },
        addEventListener: (_type, l) => void member.listeners.push(l),
      };
      members.push(member);
      return { channel: member.channel, close: () => (member.open = false) };
    },
  };
}

describe("second tab guard (#4)", () => {
  it("blocks the new tab and leaves the first one working", () => {
    const b = bus();
    const first = createTabGuard(b.join().channel, { id: "a", startedAt: 100 });
    const second = createTabGuard(b.join().channel, { id: "b", startedAt: 200 });
    expect(first.isBlocked()).toBe(false);
    expect(second.isBlocked()).toBe(true);
  });

  it("tells subscribers once when the tab becomes blocked", () => {
    const b = bus();
    createTabGuard(b.join().channel, { id: "a", startedAt: 100 });
    const ch = b.join().channel;
    let calls = 0;
    // Subscribe before the reply arrives: hold the hello back until then.
    const held: unknown[] = [];
    const guard = createTabGuard({ postMessage: (m) => held.push(m), addEventListener: ch.addEventListener }, { id: "b", startedAt: 200 });
    guard.subscribe(() => calls++);
    held.forEach((m) => ch.postMessage(m));
    expect(guard.isBlocked()).toBe(true);
    expect(calls).toBe(1);
  });

  it("two tabs opened at the same moment: exactly one is blocked", () => {
    const b = bus();
    const x = createTabGuard(b.join().channel, { id: "x", startedAt: 100 });
    const y = createTabGuard(b.join().channel, { id: "y", startedAt: 100 });
    expect([x.isBlocked(), y.isBlocked()].sort()).toEqual([false, true]);
  });

  it("a blocked tab stays quiet, so a new tab works once the tab in use is closed", () => {
    const b = bus();
    const first = b.join();
    createTabGuard(first.channel, { id: "a", startedAt: 100 });
    const second = createTabGuard(b.join().channel, { id: "b", startedAt: 200 });
    expect(second.isBlocked()).toBe(true);
    first.close();
    const third = createTabGuard(b.join().channel, { id: "c", startedAt: 300 });
    expect(third.isBlocked()).toBe(false);
  });

  it("ignores unrelated messages", () => {
    const b = bus();
    const me = b.join();
    const guard = createTabGuard(me.channel, { id: "a", startedAt: 100 });
    const other = b.join().channel;
    for (const junk of [null, "hello", { type: "hello" }, { type: "other", tab: { id: "z", startedAt: 1 } }]) other.postMessage(junk);
    expect(guard.isBlocked()).toBe(false);
    expect(openedBefore({ id: "a", startedAt: 1 }, { id: "b", startedAt: 1 })).toBe(true);
  });
});
