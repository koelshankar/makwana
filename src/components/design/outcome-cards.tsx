"use client";

import { ArrowRight, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { ruleLabel, splitMessage } from "@/lib/rule-labels";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project-store";
import { applyWarningFix, placeWithFix } from "./commit";
import { useInteraction, type ClientPoint } from "./interaction";

/** Positions a card under (or above) a client point, kept inside the container. */
function useAnchored(container: React.RefObject<HTMLElement | null>, at: ClientPoint | null, width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; above: boolean } | null>(null);
  useLayoutEffect(() => {
    const box = container.current?.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 260;
    if (!box || !at) return;
    const x = at.x - box.left;
    const y = at.y - box.top;
    const left = Math.min(Math.max(12, x - width / 2), box.width - width - 12);
    const above = y + 18 + h > box.height - 8 && y - 18 - h > 8;
    setPos({ left, top: above ? y - 18 - h : Math.min(y + 18, box.height - h - 8), arrow: Math.min(Math.max(18, x - left), width - 18), above });
  }, [container, at, width]); // `at` is stable for the life of an outcome
  return { ref, pos };
}

/** Mockup 3's blocked card: nothing has been placed; each fix places the unit as fixed. */
export function BlockedCard({ container }: { container: React.RefObject<HTMLElement | null> }) {
  const outcome = useInteraction((s) => s.outcome);
  const project = useProjectStore((s) => s.project);
  const shown = outcome?.kind === "blocked" && outcome.project === project ? outcome : null;
  const { ref, pos } = useAnchored(container, shown?.at ?? null, 384);
  if (!shown) return null;
  const close = () => useInteraction.getState().set({ outcome: null });
  const first = shown.results.find((r) => r.status === "blocked") ?? shown.results[0];
  if (!first) return null;
  const { title, detail } = splitMessage(first.message);
  const more = shown.results.filter((r) => r.status === "blocked").length - 1;

  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-label="Placement blocked"
      data-outcome="blocked"
      className="absolute z-30 w-[384px] rounded-2xl bg-mk-panel p-4 shadow-[0_16px_40px_rgba(28,27,25,0.16)] ring-1 ring-black/8"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {pos && (
        <span
          className={cn("absolute size-3 rotate-45 bg-mk-panel ring-1 ring-black/8", pos.above ? "-bottom-1.5 [clip-path:polygon(100%_0,100%_100%,0_100%)]" : "-top-1.5 [clip-path:polygon(0_0,100%_0,0_100%)]")}
          style={{ left: pos.arrow - 6 }}
        />
      )}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mk-bad-soft px-2.5 py-1 text-[12px] font-medium text-mk-bad">
          <span className="size-1.5 rounded-full bg-mk-bad" /> Blocked
        </span>
        <span className="num text-[11.5px] text-mk-faint">{ruleLabel(first)}</span>
      </div>
      <h3 className="mt-3 text-[15px] leading-snug font-semibold">{title}</h3>
      {detail && <p className="mt-1.5 text-[13px] leading-relaxed text-mk-ink-2">{detail}</p>}
      {more > 0 && <p className="mt-1.5 text-[12px] text-mk-bad">+{more} more blocking issue{more === 1 ? "" : "s"}</p>}
      {first.fixes.length > 0 && (
        <>
          <div className="mt-3.5 mb-2 text-[11px] font-medium tracking-[0.14em] text-mk-faint uppercase">Suggested fixes</div>
          <div className="flex flex-col gap-1.5">
            {first.fixes.map((fix, i) => (
              <button
                key={fix.label}
                type="button"
                onClick={() => placeWithFix(shown.candidate, shown.isNew, fix, shown.at)}
                className={cn(
                  "flex h-[40px] items-center justify-between rounded-lg border px-3 text-left text-[13px] transition-colors",
                  i === 0 ? "border-mk-ink text-mk-ink hover:bg-mk-canvas" : "border-mk-line text-mk-ink-2 hover:border-mk-ink-2",
                )}
              >
                <span className="truncate">{fix.label}</span>
                <ArrowRight className="size-4 shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
      <button type="button" onClick={close} className="mt-2.5 h-[34px] rounded-lg px-3 text-[13px] text-mk-ink-2 hover:bg-mk-subtle">
        Cancel
      </button>
    </div>
  );
}

/** Small amber note after a drop that placed with warnings, with the warnings' fixes as buttons. */
export function WarningNote({ container }: { container: React.RefObject<HTMLElement | null> }) {
  const outcome = useInteraction((s) => s.outcome);
  const project = useProjectStore((s) => s.project);
  const shown = outcome?.kind === "warning" && outcome.project === project ? outcome : null;
  const { ref, pos } = useAnchored(container, shown?.at ?? null, 320);
  if (!shown) return null;
  return (
    <div
      ref={ref}
      role="status"
      data-outcome="warning"
      className="absolute z-30 w-[320px] rounded-xl border border-mk-warn/40 bg-mk-warn-soft p-3 shadow-[0_8px_24px_rgba(28,27,25,0.12)]"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-mk-warn" />
        <div className="min-w-0 flex-1 space-y-2">
          {shown.results.map((r) => (
            <div key={r.message}>
              <p className="text-[13px] leading-snug text-mk-ink">{r.message}</p>
              {r.fixes.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.fixes.map((fix) => (
                    <button
                      key={fix.label}
                      type="button"
                      onClick={() => applyWarningFix(fix)}
                      className="rounded-md border border-mk-warn/50 bg-mk-panel px-2 py-1 text-[12px] text-mk-ink hover:border-mk-warn"
                    >
                      {fix.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" aria-label="Dismiss" onClick={() => useInteraction.getState().set({ outcome: null })} className="text-mk-faint hover:text-mk-ink">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
