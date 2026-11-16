"use client";

import { Minus, Plus, Presentation, RotateCcw, RotateCw, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { catalogue, getFinish, getModule } from "@/domain/catalogue";
import { finishGroup, type FinishGroup } from "@/domain/finish-defaults";
import type { Project } from "@/domain/types";
import type { SceneApi, SceneGhost, ViewPreset } from "@/components/three/kitchen-scene";
import { SceneBoundary } from "@/components/three/scene-boundary";
import { FULL_VIEW_CLASS, FullViewButton, useFullView } from "@/components/shell/full-view";
import { Segmented, WallHeightToggle } from "@/components/three/wall-height-toggle";
import { cn } from "@/lib/utils";
import { projectStore, useBlockedIds, useProjectStore } from "@/store/project-store";
import { ghostWorldBox, labelOf } from "./ghost";
import { useInteraction, type Ghost } from "./interaction";

const KitchenScene = dynamic(() => import("@/components/three/kitchen-scene").then((m) => m.KitchenScene), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-mk-subtle/60" />,
});

const GROUP_LABELS: Record<FinishGroup, string> = { base: "Base", upper: "Wall & loft", tall: "Tall" };

/** Short finish name for the legend: "Matte Lacquer – Sage Green" → "Sage Green". */
const shortName = (name: string) => name.split("–").pop()!.trim();

/** The most used finish per group. */
function legend(project: Project) {
  const counts = new Map<FinishGroup, Map<string, number>>();
  for (const m of project.modules) {
    const mod = getModule(catalogue, m.moduleCode);
    if (mod.family === "FIL") continue;
    const g = finishGroup(m.layer);
    const byFinish = counts.get(g) ?? new Map<string, number>();
    byFinish.set(m.finishId, (byFinish.get(m.finishId) ?? 0) + 1);
    counts.set(g, byFinish);
  }
  return (["base", "upper", "tall"] as FinishGroup[]).flatMap((g) => {
    const byFinish = counts.get(g);
    if (!byFinish) return [];
    const [finishId] = [...byFinish].sort((a, b) => b[1] - a[1])[0];
    const f = getFinish(catalogue, finishId);
    return [{ key: g, label: `${GROUP_LABELS[g]} · ${shortName(f.name)}`, hex: f.hex }];
  });
}

/** The drag ghost as a world box, pushed to the scene without re-rendering this panel. */
function subscribeGhost(cb: (g: SceneGhost | null) => void) {
  let last: Ghost | null | undefined;
  const emit = (g: Ghost | null) => {
    if (g === last) return;
    last = g;
    if (!g) return cb(null);
    const box = ghostWorldBox(projectStore.getState().project, g);
    cb(box ? { box, ok: g.status === "pass" } : null);
  };
  emit(useInteraction.getState().ghost);
  return useInteraction.subscribe((s) => emit(s.ghost));
}

export function ThreePanel() {
  const project = useProjectStore((s) => s.project);
  const selectedId = useProjectStore((s) => s.ui.selectedPlacementId);
  const activeWallId = useProjectStore((s) => s.ui.activeWallId);
  const designWallHeight = useProjectStore((s) => s.ui.wallHeight);
  const presentWallHeight = useProjectStore((s) => s.ui.presentWallHeight);
  const customer = useProjectStore((s) => s.ui.customerView);
  // Show customer has its own wall mode, Auto by default; Design keeps the salesperson's choice.
  const wallHeight = customer ? presentWallHeight : designWallHeight;
  const performance = useProjectStore((s) => s.settings.performanceMode);
  const autoSwitched = useProjectStore((s) => s.settings.performanceAutoSwitched);
  const blocked = useBlockedIds();
  const outcome = useInteraction((s) => s.outcome);
  const api = useRef<SceneApi>(null);
  // Full screen keeps the salesperson's view (preset, selection, wall mode, labels); Show customer is the customer's.
  const fullView = useFullView();
  /** The preset the view is on; cleared by a quarter turn. */
  const [preset, setPreset] = useState<ViewPreset | null>("3d");
  const items = useMemo(() => legend(project), [project]);
  const selected = project.modules.find((m) => m.id === selectedId);
  const notPlaced = outcome?.kind === "blocked" && outcome.project === project ? labelOf(outcome.candidate) : null;
  const wallId = activeWallId ?? project.room.walls[0]?.id;
  const { setCustomerView } = projectStore.getState();
  const setWallHeight = customer ? projectStore.getState().setPresentWallHeight : projectStore.getState().setWallHeight;

  /** Slow frames while orbiting switch performance mode on, once per demo, with a toast. */
  const onSlowFrames = useCallback(() => {
    if (projectStore.getState().settings.performanceMode) return;
    projectStore.getState().setPerformanceMode(true, true);
    toast("Switched to performance mode for smoother 3D", { id: "performance-mode", description: "Turn it off in the demo menu." });
  }, []);

  const onSelect = useCallback((id: string) => {
    projectStore.getState().select(id);
    useInteraction.getState().set({ outcome: null });
  }, []);

  const exitCustomer = useCallback(() => {
    setCustomerView(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [setCustomerView]);
  const showCustomer = () => {
    if (fullView.on) fullView.exit(true);
    setCustomerView(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  // Rows in the checks popover ask the scene to frame what they point at.
  useEffect(
    () =>
      useInteraction.subscribe((st, prev) => {
        if (st.frameRequest && st.frameRequest !== prev.frameRequest) api.current?.frame(st.frameRequest);
      }),
    [],
  );

  // Leaving browser full screen (Esc) also leaves the customer view.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && projectStore.getState().ui.customerView) setCustomerView(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [setCustomerView]);

  const btn = "flex size-8 items-center justify-center rounded-md text-mk-ink hover:bg-mk-subtle";
  return (
    <section
      data-three-panel
      data-customer={customer || undefined}
      data-full-view={(fullView.on && !customer) || undefined}
      className={cn("flex min-w-0 flex-col bg-[#f1efeb]", customer ? "fixed inset-0 z-50" : fullView.on ? FULL_VIEW_CLASS : "relative flex-1")}
    >
      <header className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-mk-line bg-[#f1efeb] px-4">
        <div className="flex min-w-0 items-baseline gap-2.5">
          {/* Below 1440 px the Design header needs the room for the wall-height and view buttons. */}
          <h2 className={cn("shrink-0 text-[15px] font-semibold", !customer && "max-[1439px]:sr-only")}>{customer ? project.name : "3D view"}</h2>
          {customer && <span className="truncate text-[12.5px] text-mk-muted">{project.siteAddress}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <WallHeightToggle value={wallHeight} onChange={setWallHeight} />
          {customer ? (
            <button type="button" onClick={exitCustomer} className="flex h-8 items-center gap-1.5 rounded-lg bg-mk-ink px-3 text-[12.5px] font-medium text-white hover:bg-mk-ink/90">
              <X className="size-3.5" />
              Exit
            </button>
          ) : (
            <>
              <FullViewButton on={fullView.on} onToggle={fullView.toggle} />
              <button
                type="button"
                onClick={showCustomer}
                aria-label="Show customer"
                title="Show customer: full-screen 3D"
                className="flex h-8 items-center gap-1.5 rounded-lg border border-mk-line bg-mk-panel px-2 text-[12.5px] font-medium hover:bg-mk-subtle"
              >
                <Presentation className="size-3.5" />
                <span className="hidden min-[1500px]:inline">Show customer</span>
              </button>
            </>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <SceneBoundary>
          <KitchenScene
            ref={api}
            project={project}
            selectedId={customer ? null : selectedId}
            blockedIds={blocked}
            wallHeight={wallHeight}
            activeWallId={wallId}
            interactive={!customer}
            subscribeGhost={subscribeGhost}
            onSelect={onSelect}
            performance={performance}
            onSlowFrames={performance || autoSwitched ? undefined : onSlowFrames}
            wallLabels={!customer}
          />

          {!customer && (notPlaced || selected) && (
            <div className="pointer-events-none absolute top-3 left-4 text-[12px]">
              {notPlaced ? (
                <span className="num text-mk-bad">{notPlaced} · not placed</span>
              ) : (
                <span className="flex items-center gap-1.5 text-mk-accent-ink">
                  <span className="size-2.5 rounded-[2px] border-[1.5px] border-mk-accent" />
                  <span className="num">{selected!.moduleCode}</span>
                </span>
              )}
            </div>
          )}

          <div className="absolute top-2.5 right-3">
            <Segmented<ViewPreset>
              label="View"
              value={preset}
              options={[
                { value: "3d", label: "3D" },
                { value: "top", label: "Top" },
                { value: "wall", label: `Facing ${wallId ?? ""}` },
              ]}
              onChange={(p) => {
                setPreset(p);
                api.current?.preset(p);
              }}
            />
          </div>

          <ul className={cn("pointer-events-none absolute left-4 space-y-1 text-[12px] text-mk-ink-2", customer ? "bottom-4" : "bottom-[60px]")}>
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-2">
                <span className="size-3 rounded-[3px] border border-black/10" style={{ background: i.hex }} />
                {i.label}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-[3px] border border-black/10 bg-[#cfcac2]" />
              Walls, duct box, column
            </li>
            {blocked.size > 0 && !customer && (
              <li className="flex items-center gap-2 text-mk-bad">
                <span className="size-3 rounded-[3px] border border-mk-bad bg-[#e9a395]" />
                Blocked
              </li>
            )}
          </ul>

          <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-xl border border-mk-line bg-mk-panel p-1 shadow-[0_2px_8px_rgba(28,27,25,0.06)]">
            <button type="button" aria-label="Rotate left" className={btn} onClick={() => {
                setPreset(null);
                api.current?.rotate(-1);
              }}>
              <RotateCcw className="size-4" />
            </button>
            <button type="button" aria-label="Rotate right" className={btn} onClick={() => {
                setPreset(null);
                api.current?.rotate(1);
              }}>
              <RotateCw className="size-4" />
            </button>
            <span className="mx-1 h-5 w-px bg-mk-line" />
            <button type="button" aria-label="Zoom out" className={btn} onClick={() => api.current?.zoom(0.8)}>
              <Minus className="size-4" />
            </button>
            <button type="button" aria-label="Zoom in" className={btn} onClick={() => api.current?.zoom(1.25)}>
              <Plus className="size-4" />
            </button>
            <span className="mx-1 h-5 w-px bg-mk-line" />
            <button
              type="button"
              className="h-8 rounded-md px-2.5 text-[12.5px] font-medium whitespace-nowrap hover:bg-mk-subtle"
              onClick={() => {
                setPreset("3d");
                api.current?.reset();
              }}
            >
              Reset view
            </button>
          </div>
        </SceneBoundary>
      </div>
    </section>
  );
}
