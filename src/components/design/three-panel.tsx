"use client";

import { Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useRef } from "react";
import { catalogue, getFinish, getModule } from "@/domain/catalogue";
import { finishGroup, type FinishGroup } from "@/domain/finish-defaults";
import type { Project } from "@/domain/types";
import type { SceneApi } from "@/components/three/kitchen-scene";
import { projectStore, useBlockedIds, useProjectStore } from "@/store/project-store";
import { useInteraction } from "./interaction";

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

export function ThreePanel() {
  const project = useProjectStore((s) => s.project);
  const selectedId = useProjectStore((s) => s.ui.selectedPlacementId);
  const blocked = useBlockedIds();
  const ghost = useInteraction((s) => s.ghost);
  const outcome = useInteraction((s) => s.outcome);
  const api = useRef<SceneApi>(null);
  const items = useMemo(() => legend(project), [project]);
  const selected = project.modules.find((m) => m.id === selectedId);
  const notPlaced = outcome?.kind === "blocked" && outcome.project === project ? outcome.candidate.moduleCode : null;
  const sceneGhost = useMemo(() => (ghost ? { placement: ghost.candidate, ok: ghost.status === "pass" } : null), [ghost]);

  const btn = "flex size-8 items-center justify-center rounded-md text-mk-ink hover:bg-mk-subtle";
  return (
    <section className="relative flex min-w-0 flex-1 flex-col bg-[#f1efeb]">
      <header className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-mk-line bg-[#f1efeb] px-4">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="text-[15px] font-semibold">3D view</h2>
          <span className="truncate text-[12.5px] text-mk-muted">Updates with the plan</span>
        </div>
        {notPlaced ? (
          <span className="num shrink-0 text-[12px] text-mk-bad">{notPlaced} · not placed</span>
        ) : selected ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-mk-accent-ink">
            <span className="size-2.5 rounded-[2px] border-[1.5px] border-mk-accent" />
            <span className="num">{selected.moduleCode}</span>
          </span>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1">
        <KitchenScene
          ref={api}
          project={project}
          selectedId={selectedId}
          blockedIds={blocked}
          ghost={sceneGhost}
          onSelect={(id) => {
            projectStore.getState().select(id);
            useInteraction.getState().set({ outcome: null });
          }}
        />

        <ul className="pointer-events-none absolute bottom-[60px] left-4 space-y-1 text-[12px] text-mk-ink-2">
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
          {blocked.size > 0 && (
            <li className="flex items-center gap-2 text-mk-bad">
              <span className="size-3 rounded-[3px] border border-mk-bad bg-[#e9a395]" />
              Blocked
            </li>
          )}
        </ul>

        <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-xl border border-mk-line bg-mk-panel p-1 shadow-[0_2px_8px_rgba(28,27,25,0.06)]">
          <button type="button" aria-label="Rotate left" className={btn} onClick={() => api.current?.rotate(-Math.PI / 8)}>
            <RotateCcw className="size-4" />
          </button>
          <button type="button" aria-label="Rotate right" className={btn} onClick={() => api.current?.rotate(Math.PI / 8)}>
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
          <button type="button" className="h-8 rounded-md px-2.5 text-[12.5px] font-medium hover:bg-mk-subtle" onClick={() => api.current?.reset()}>
            Reset view
          </button>
        </div>
      </div>
    </section>
  );
}
