"use client";

// Blocks a second tab of the demo (see src/lib/tab-guard.ts). One guard per page load, shared by
// every route, so moving between screens never re-announces the tab.

import { useSyncExternalStore } from "react";
import { createTabGuard, TAB_CHANNEL, type TabGuard as Guard } from "@/lib/tab-guard";

let guard: Guard | null | undefined;

function getGuard(): Guard | null {
  if (guard !== undefined) return guard;
  if (typeof window === "undefined") return null;
  try {
    const channel = new BroadcastChannel(TAB_CHANNEL);
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    guard = createTabGuard(channel, { id, startedAt: performance.timeOrigin });
  } catch {
    guard = null; // No BroadcastChannel: never blocked.
  }
  return guard;
}

const noop = () => {};

function SecondTabNotice() {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-mk-canvas px-6 text-center text-mk-ink" role="alertdialog" aria-modal="true" aria-labelledby="second-tab-title" data-second-tab>
      <div className="mb-2 leading-none">
        <div className="text-[16px] font-semibold tracking-[0.32em]">MAKWANA</div>
        <div className="mt-1.5 text-[8.5px] font-medium tracking-[0.36em] text-mk-muted">MODULAR KULTURE</div>
      </div>
      <p id="second-tab-title" className="text-[16px] font-medium">
        This demo is open in another tab.
      </p>
      <p className="max-w-md text-[13.5px] text-mk-muted">Carry on in that tab and close this one. To use this tab instead, close the other tab and reload this one.</p>
    </div>
  );
}

export function TabGuard({ children }: { children: React.ReactNode }) {
  const blocked = useSyncExternalStore(
    (onChange) => getGuard()?.subscribe(onChange) ?? noop,
    () => getGuard()?.isBlocked() ?? false,
    () => false,
  );
  // Nothing of the app renders behind the notice: no shortcuts, and no edits that would be saved.
  return blocked ? <SecondTabNotice /> : children;
}
