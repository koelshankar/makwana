"use client";

import dynamic from "next/dynamic";
import { type RefObject } from "react";
import { DesignPlan } from "@/components/design/design-plan";
import type { SceneApi } from "@/components/three/kitchen-scene";
import { SceneBoundary } from "@/components/three/scene-boundary";
import { WallHeightToggle } from "@/components/three/wall-height-toggle";
import type { QuoteModel } from "@/domain/quote";
import { projectStore, useProjectStore } from "@/store/project-store";
import { ChecksSummary, Swatch } from "./quote-parts";

const KitchenScene = dynamic(() => import("@/components/three/kitchen-scene").then((m) => m.KitchenScene), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-mk-subtle/60" />,
});

const EMPTY = new Set<string>();

function Card({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-mk-line ${className ?? ""}`}>
      <span className="num pointer-events-none absolute top-3.5 left-4 z-10 text-[11px] tracking-[0.16em] text-mk-muted uppercase">{label}</span>
      {children}
    </div>
  );
}

/** Left column: the final design in 3D and plan, and what it is made of. */
export function QuoteSide({ model, scene }: { model: QuoteModel; scene: RefObject<SceneApi | null> }) {
  const project = useProjectStore((s) => s.project);
  const performance = useProjectStore((s) => s.settings.performanceMode);
  const wallHeight = useProjectStore((s) => s.ui.presentWallHeight);
  const s = model.summary;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-4 border-b border-mk-line py-2.5 text-[14px] last:border-b-0">
      <span className="w-[86px] shrink-0 text-mk-muted">{label}</span>
      <span className="min-w-0 flex-1">{value}</span>
    </div>
  );
  return (
    <aside className="flex flex-col gap-4">
      <Card label="3D · Final design" className="h-[268px] bg-[#f1efeb]">
        <SceneBoundary>
          <div className="absolute inset-0" data-quote-3d>
            <KitchenScene ref={scene} project={project} selectedId={null} blockedIds={EMPTY} wallHeight={wallHeight} interactive={false} performance={performance} />
          </div>
          {/* The PDF picture is taken from this view, so it shows the same walls. */}
          <div className="absolute top-2.5 right-3 z-10">
            <WallHeightToggle value={wallHeight} onChange={projectStore.getState().setPresentWallHeight} />
          </div>
          <button
            type="button"
            onClick={() => scene.current?.reset()}
            className="absolute right-3 bottom-3 rounded-lg border border-mk-line bg-mk-panel px-2.5 py-1 text-[12px] font-medium shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:bg-mk-subtle"
          >
            Reset view
          </button>
        </SceneBoundary>
      </Card>
      <Card label={`Plan · ${s.walls} walls`} className="h-[220px] bg-mk-panel">
        <div className="absolute inset-0 flex pt-6" data-quote-plan>
          <DesignPlan readOnly compact />
        </div>
      </Card>
      <div className="px-1">
        {row("Room", `${s.walls} walls · ceiling ${s.ceilingMm} mm`)}
        {row("Layout", s.layout)}
        {row("Carcass", s.carcasses.join(", ") || "—")}
        {row(
          "Finishes",
          <ul className="space-y-1.5">
            {s.finishes.map((f) => (
              <li key={f.name} className="flex items-center gap-2.5">
                <Swatch hex={f.hex} className="size-3.5" />
                {f.name}
              </li>
            ))}
          </ul>,
        )}
      </div>
      <div className="px-1">
        <ChecksSummary checks={model.checks} approvedBy={model.header.approvedBy} />
      </div>
    </aside>
  );
}
