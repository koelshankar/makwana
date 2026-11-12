"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { projectStore, useProjectStore } from "@/store/project-store";
import { DesignPlan } from "./design-plan";
import { Elevation } from "./elevation/elevation";
import { BlockedCard, WarningNote } from "./outcome-cards";

/** Plan and per-wall elevation tabs. */
export function ViewsPanel() {
  const walls = useProjectStore((s) => s.project.room.walls);
  const ceiling = useProjectStore((s) => s.project.room.ceilingHeightMm);
  const tab = useProjectStore((s) => s.ui.designTab);
  const active = useProjectStore((s) => s.ui.activeWallId);
  const zoom = useProjectStore((s) => s.ui.elevationZoom);
  const { setDesignTab, showWall, setElevationZoom } = projectStore.getState();
  const wall = walls.find((w) => w.id === active) ?? walls[0];
  const containerRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Keep the active tab in view when selection switches walls.
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab, wall?.id]);

  return (
    <section ref={containerRef} className="relative flex min-w-0 flex-1 flex-col border-r border-mk-line bg-mk-panel">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-mk-line px-3">
        <div ref={tabsRef} role="tablist" aria-label="Views" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-xl bg-mk-subtle p-1 [scrollbar-width:none] max-[1439px]:[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]">
          {[{ id: "plan", label: "Plan" }, ...walls.map((w) => ({ id: w.id, label: `Wall ${w.id}` }))].map((t) => {
            const selected = t.id === "plan" ? tab === "plan" : tab === "wall" && wall?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => (t.id === "plan" ? setDesignTab("plan") : showWall(t.id))}
                className={cn(
                  "h-[30px] shrink-0 rounded-lg px-3 text-[13px] whitespace-nowrap transition-colors",
                  selected ? "bg-mk-panel font-medium text-mk-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-mk-ink-2 hover:text-mk-ink",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {/* Narrow screens give the wall tabs the room; the drawing names its wall anyway. */}
        <span className="num hidden shrink-0 text-[11px] tracking-[0.12em] text-mk-faint uppercase min-[1440px]:inline">
          {tab === "plan" ? "Plan · top view" : wall ? `Elevation · ${wall.lengthMm} × ${ceiling}` : ""}
        </span>
      </header>

      {tab === "plan" || !wall ? <DesignPlan /> : <Elevation key={wall.id} wallId={wall.id} />}

      {tab === "wall" && wall && (
        <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg border border-mk-line bg-mk-panel p-0.5 shadow-sm">
          <button type="button" aria-label="Zoom out" onClick={() => setElevationZoom(zoom / 1.25)} className="flex size-7 items-center justify-center rounded-md hover:bg-mk-subtle">
            <Minus className="size-3.5" />
          </button>
          <button type="button" onClick={() => setElevationZoom(1)} className="num w-11 text-center text-[11.5px] text-mk-ink-2" title="Fit">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => setElevationZoom(zoom * 1.25)} className="flex size-7 items-center justify-center rounded-md hover:bg-mk-subtle">
            <Plus className="size-3.5" />
          </button>
        </div>
      )}

      <BlockedCard container={containerRef} />
      <WarningNote container={containerRef} />
    </section>
  );
}
