"use client";

import { useMemo, useRef } from "react";
import { isRoomClosed, roomOutline, wallFrames } from "@/domain/geometry";
import type { Layer } from "@/domain/types";
import { WALL_THICKNESS_MM } from "@/domain/zones";
import { ZoomControls } from "@/components/setup/plan/plan-toolbar";
import { PlanBase } from "@/components/setup/plan/plan-base";
import { dimensionPlan, fitBox, labelPoint } from "@/components/setup/plan/plan-geometry";
import { usePlanViewport } from "@/components/setup/plan/plan-viewport";
import { projectStore, useBlockedIds, useProjectStore, useWorldBoxes } from "@/store/project-store";
import { useInteraction } from "./interaction";

/** Footprint colours by layer; uppers are drawn dashed over the base run, as on drawings. */
export const LAYER_FILL: Record<Layer, string> = { base: "#cdd8c6", tall: "#77736d", wall: "#f3eee3", loft: "#e7dfcf" };
const LAYER_ORDER: Layer[] = ["tall", "base", "wall", "loft"];

/** Top view with every unit's footprint. Click to select; no dragging in plan. */
export function DesignPlan() {
  const project = useProjectStore((s) => s.project);
  const selectedId = useProjectStore((s) => s.ui.selectedPlacementId);
  const activeWallId = useProjectStore((s) => s.ui.activeWallId);
  const boxes = useWorldBoxes();
  const blocked = useBlockedIds();
  const room = project.room;
  const fit = useMemo(() => fitBox(room), [room]);
  const frames = useMemo(() => wallFrames(room), [room]);
  const outline = useMemo(() => roomOutline(room, WALL_THICKNESS_MM), [room]);
  const dims = useMemo(() => dimensionPlan(room), [room]);
  const centre = useMemo(() => labelPoint(outline.inner), [outline.inner]);
  const { boxRef, svgRef, setView, zoom, cx, cy, vb, px, zoomAt, toWorld } = usePlanViewport(fit);
  const pan = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  const placements = useMemo(() => {
    const list = [...project.modules.map((m) => ({ id: m.id, layer: m.layer, label: m.moduleCode }))];
    for (const a of project.appliances) if (a.kind === "free") list.push({ id: a.id, layer: a.layer, label: a.applianceId });
    return LAYER_ORDER.flatMap((layer) => list.filter((p) => p.layer === layer));
  }, [project]);

  return (
    <div ref={boxRef} className="relative min-h-0 flex-1">
      <svg
        ref={svgRef}
        className="absolute inset-0 size-full touch-none select-none"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onPointerDown={(e) => {
          svgRef.current!.setPointerCapture(e.pointerId);
          pan.current = { x: e.clientX, y: e.clientY, cx, cy, moved: false };
        }}
        onPointerMove={(e) => {
          const g = pan.current;
          if (!g) return;
          const dx = e.clientX - g.x;
          const dy = e.clientY - g.y;
          if (!g.moved && Math.hypot(dx, dy) < 4) return;
          g.moved = true;
          setView({ zoom, cx: g.cx - dx * px, cy: g.cy - dy * px });
        }}
        onPointerUp={() => {
          if (pan.current && !pan.current.moved) projectStore.getState().select(null);
          pan.current = null;
        }}
        onWheel={(e) => zoomAt(Math.exp(-e.deltaY * 0.0015), toWorld(e))}
        role="img"
        aria-label="Plan with units"
      >
        <PlanBase
          room={room}
          frames={frames}
          outline={outline}
          dims={dims}
          vb={vb}
          px={px}
          closed={isRoomClosed(room)}
          roomCentre={centre}
          selectedWallId={activeWallId}
          showMarkers={false}
        >
          {placements.map((p) => {
            const b = boxes.get(p.id);
            if (!b) return null;
            const isSel = p.id === selectedId;
            const isBlocked = blocked.has(p.id);
            const upper = p.layer === "wall" || p.layer === "loft";
            return (
              <rect
                key={p.id}
                x={b.minX}
                y={b.minY}
                width={b.maxX - b.minX}
                height={b.maxY - b.minY}
                fill={isBlocked ? "var(--mk-bad-soft)" : isSel ? "var(--mk-accent-soft)" : LAYER_FILL[p.layer]}
                fillOpacity={upper ? 0.55 : 1}
                stroke={isBlocked ? "var(--mk-bad)" : isSel ? "var(--mk-accent)" : "#5d5a55"}
                strokeWidth={isSel || isBlocked ? 2 : 0.9}
                strokeDasharray={upper ? "5 3" : undefined}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  projectStore.getState().select(p.id);
                  useInteraction.getState().set({ outcome: null });
                }}
              >
                <title>{p.label}</title>
              </rect>
            );
          })}
        </PlanBase>
      </svg>
      <div className="absolute right-3 bottom-3">
        <ZoomControls percent={Math.round(zoom * 100)} onZoomIn={() => zoomAt(1.25)} onZoomOut={() => zoomAt(0.8)} onFit={() => setView(null)} />
      </div>
    </div>
  );
}
