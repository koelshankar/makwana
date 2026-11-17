"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { headingVector, isRoomClosed, roomOutline, wallFrames, wallToWorld, worldToWall, type WallFrame } from "@/domain/geometry";
import { closingHint, gapClosure, rectInsidePolygon, validateRoom } from "@/domain/room-validation";
import { endPhrase, freeEnds, sameEnd, startEnd } from "@/domain/wall-ends";
import type { Feature, Point } from "@/domain/types";
import { WALL_THICKNESS_MM } from "@/domain/zones";
import { FULL_VIEW_CLASS, useFullView } from "@/components/shell/full-view";
import { cn } from "@/lib/utils";
import { mm, snap10 } from "@/lib/room-format";
import { projectStore, useProjectStore, type NewFeature } from "@/store/project-store";
import { FeatureForm } from "../feature-form";
import { notifyRecheck } from "../recheck";
import { useSetupUi } from "../setup-ui";
import { dimensionPlan, fitBox, labelPoint, pointInPolygon } from "./plan-geometry";
import { C, featureOffset, PlanBase, pts, wallRect } from "./plan-base";
import { PlanToolbar, ZoomControls } from "./plan-toolbar";
import { usePlanViewport } from "./plan-viewport";

const COLUMN_SIZE = 300;
const COLUMN_SNAP = 150;

/** The wall a point is on or just in front of, with its wall-local offset. */
function hitWall(frames: WallFrame[], p: Point): { frame: WallFrame; along: number } | null {
  let best: { frame: WallFrame; along: number; d: number } | null = null;
  for (const frame of frames) {
    const q = worldToWall(frame, p);
    if (q.offsetMm < 0 || q.offsetMm > frame.lengthMm) continue;
    if (q.depthMm < -WALL_THICKNESS_MM - 60 || q.depthMm > 350) continue;
    const d = Math.abs(q.depthMm + WALL_THICKNESS_MM / 2);
    if (!best || d < best.d) best = { frame, along: q.offsetMm, d };
  }
  return best;
}

/** A 300 × 300 column centred on the click, snapped flush to any wall within 150 mm. */
function snapColumn(frames: WallFrame[], p: Point) {
  let x = snap10(p.x - COLUMN_SIZE / 2);
  let y = snap10(p.y - COLUMN_SIZE / 2);
  for (const f of frames) {
    const near = worldToWall(f, { x: x + COLUMN_SIZE / 2, y: y + COLUMN_SIZE / 2 });
    if (near.offsetMm < 0 || near.offsetMm > f.lengthMm) continue;
    const gap = near.depthMm - COLUMN_SIZE / 2; // distance from the column's face to the wall
    if (gap > 0 && gap <= COLUMN_SNAP) {
      x -= f.n.x * gap;
      y -= f.n.y * gap;
    }
  }
  return { x, y };
}

type Ghost =
  | { kind: "opening"; wallId: string; offset: number; width: number }
  | { kind: "plumbing"; wallId: string; offset: number }
  | { kind: "wall"; wallId: string }
  | { kind: "column"; x: number; y: number; ok: boolean };

type Gesture =
  | { kind: "pan"; startX: number; startY: number; cx: number; cy: number; moved: boolean }
  | { kind: "drag"; featureId: string; grab: number; start: number };

export function RoomPlan() {
  const room = useProjectStore((s) => s.project.room);
  const tool = useSetupUi((s) => s.tool);
  const openingKind = useSetupUi((s) => s.openingKind);
  const selectedWallId = useSetupUi((s) => s.selectedWallId);
  const selectedFeatureId = useSetupUi((s) => s.selectedFeatureId);
  const addingWall = useSetupUi((s) => s.addingWall);
  const wallStart = useSetupUi((s) => s.wallStart);
  const wallDraft = useSetupUi((s) => s.wallDraft);
  const { selectWall, selectFeature, setTool, editFeature, setWallStart } = useSetupUi.getState();
  const [hoverEnd, setHoverEnd] = useState<string | null>(null);

  const fullView = useFullView();
  const walls = room.walls;
  const fit = useMemo(() => fitBox({ ...room, walls }), [walls]); // eslint-disable-line react-hooks/exhaustive-deps
  const frames = useMemo(() => wallFrames(room), [room]);
  const outline = useMemo(() => roomOutline(room, WALL_THICKNESS_MM), [room]);
  const [drag, setDrag] = useState<{ featureId: string; offset: number; valid: boolean } | null>(null);
  // Dimensions follow a feature while it is dragged.
  const dims = useMemo(
    () =>
      dimensionPlan(
        drag ? { ...room, features: room.features.map((f) => (f.id === drag.featureId ? ({ ...f, offsetMm: drag.offset } as Feature) : f)) } : room,
      ),
    [room, drag],
  );
  const hint = useMemo(() => closingHint(room), [room]);
  // The chain returns to its start, so the floor is known (columns can go in) even with a gap.
  const chainClosed = walls.length > 0 && !hint;
  const closed = isRoomClosed(room);

  const { boxRef, svgRef, size, setView, zoom, cx, cy, vb, px, zoomAt, toWorld } = usePlanViewport(fit);

  const gesture = useRef<Gesture | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [popover, setPopover] = useState<{ x: number; y: number; feature: Feature } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPopover(null);
      setGhost(null);
      setTool("select");
      setWallStart(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool, setWallStart]);

  const finishTool = () => {
    setTool("select");
    setGhost(null);
  };

  const ceiling = room.ceilingHeightMm;
  const openingDraft = (frame: WallFrame, along: number): Feature => {
    const width = openingKind === "window" ? 900 : 800;
    const offset = Math.max(0, Math.min(frame.lengthMm - width, snap10(along - width / 2)));
    return openingKind === "window"
      ? { kind: "window", id: "draft", wallId: frame.wallId, offsetMm: offset, widthMm: width, sillMm: 1050, topMm: Math.min(2100, ceiling) }
      : { kind: "door", id: "draft", wallId: frame.wallId, offsetMm: offset, widthMm: width, heightMm: Math.min(2100, ceiling) };
  };

  const onWallClick = (frame: WallFrame, e: React.MouseEvent) => {
    const p = toWorld(e);
    const along = Math.max(0, Math.min(frame.lengthMm, worldToWall(frame, p).offsetMm));
    if (tool === "opening") {
      const rect = boxRef.current!.getBoundingClientRect();
      setPopover({ x: e.clientX - rect.left, y: e.clientY - rect.top, feature: openingDraft(frame, along) });
      setGhost(null);
      return;
    }
    if (tool === "plumbing") {
      const id = projectStore.getState().addFeature({ kind: "plumbing", wallId: frame.wallId, offsetMm: snap10(along) });
      selectFeature(id);
      notifyRecheck([frame.wallId]);
      return finishTool();
    }
    if (tool === "beam") {
      const bottom = Math.max(2100, ceiling - 450);
      const id = projectStore.getState().addFeature({ kind: "beam", wallId: frame.wallId, bottomMm: bottom, depthMm: 200 });
      editFeature(id);
      notifyRecheck([frame.wallId]);
      return finishTool();
    }
    selectWall(frame.wallId);
  };

  const placeColumn = (p: Point) => {
    if (!chainClosed || !pointInPolygon(p, outline.inner)) return;
    const { x, y } = snapColumn(frames, p);
    const rect = { minX: x, maxX: x + COLUMN_SIZE, minY: y, maxY: y + COLUMN_SIZE };
    if (!rectInsidePolygon(rect, outline.inner)) return;
    const id = projectStore.getState().addFeature({ kind: "column", x, y, widthMm: COLUMN_SIZE, depthMm: COLUMN_SIZE });
    selectFeature(id);
    notifyRecheck();
    finishTool();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    svgRef.current!.setPointerCapture(e.pointerId);
    gesture.current = { kind: "pan", startX: e.clientX, startY: e.clientY, cx, cy, moved: false };
  };

  const startFeatureDrag = (f: Feature, e: React.PointerEvent) => {
    e.stopPropagation();
    selectFeature(f.id);
    const offset = featureOffset(f);
    if (tool !== "select" || offset === undefined || !("wallId" in f)) return;
    const frame = frames.find((fr) => fr.wallId === f.wallId);
    if (!frame) return;
    svgRef.current!.setPointerCapture(e.pointerId);
    gesture.current = { kind: "drag", featureId: f.id, grab: worldToWall(frame, toWorld(e)).offsetMm - offset, start: offset };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g?.kind === "pan") {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < 4) return;
      g.moved = true;
      setView({ zoom, cx: g.cx - dx * px, cy: g.cy - dy * px });
      return;
    }
    if (g?.kind === "drag") {
      const f = room.features.find((x) => x.id === g.featureId);
      if (!f || !("wallId" in f)) return;
      const frame = frames.find((fr) => fr.wallId === f.wallId)!;
      const offset = snap10(worldToWall(frame, toWorld(e)).offsetMm - g.grab);
      const candidate = { ...room, features: room.features.map((x) => (x.id === f.id ? ({ ...x, offsetMm: offset } as Feature) : x)) };
      const valid = !validateRoom(candidate).issues.some((i) => i.featureId === f.id);
      setDrag({ featureId: f.id, offset, valid });
      return;
    }

    // Hover ghosts for placement tools.
    const p = toWorld(e);
    if (tool === "opening" || tool === "plumbing" || tool === "beam") {
      const hit = hitWall(frames, p);
      if (!hit || popover) return setGhost(null);
      if (tool === "beam") return setGhost({ kind: "wall", wallId: hit.frame.wallId });
      if (tool === "plumbing") return setGhost({ kind: "plumbing", wallId: hit.frame.wallId, offset: snap10(hit.along) });
      const d = openingDraft(hit.frame, hit.along);
      return setGhost({ kind: "opening", wallId: hit.frame.wallId, offset: featureOffset(d)!, width: openingKind === "window" ? 900 : 800 });
    }
    if (tool === "column") {
      if (!chainClosed || !pointInPolygon(p, outline.inner)) return setGhost(null);
      const { x, y } = snapColumn(frames, p);
      setGhost({ kind: "column", x, y, ok: rectInsidePolygon({ minX: x, maxX: x + COLUMN_SIZE, minY: y, maxY: y + COLUMN_SIZE }, outline.inner) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === "pan" && !g.moved) {
      if (tool === "column") placeColumn(toWorld(e));
      else if (tool === "select") {
        selectFeature(null);
      }
    }
    if (g?.kind === "drag") {
      if (drag && drag.featureId === g.featureId && drag.valid && drag.offset !== g.start) {
        const f = room.features.find((x) => x.id === g.featureId)!;
        projectStore.getState().updateFeature(f.id, { offsetMm: drag.offset });
        notifyRecheck("wallId" in f ? [f.wallId] : undefined);
      }
      setDrag(null);
    }
  };

  // ----- drawing helpers (sizes in screen px via `px`) -----
  const font = (n: number) => n * px;
  const frameOf = (id: string) => frames.find((f) => f.wallId === id);
  const n = walls.length;
  const roomCentre = useMemo(() => labelPoint(outline.inner), [outline.inner]);
  // While adding walls: every free end is a handle; the one the next wall starts from is filled.
  const ends = useMemo(() => (addingWall ? freeEnds(room) : []), [addingWall, room]);
  const from = useMemo(() => (addingWall ? startEnd(room, wallStart) : null), [addingWall, room, wallStart]);

  const cursor = drag ? "grabbing" : tool === "select" || tool === "drawWall" ? "grab" : "crosshair";

  return (
    <section className={cn("flex min-w-0 flex-1 flex-col bg-mk-canvas", fullView.on ? FULL_VIEW_CLASS : "relative")} data-full-view={fullView.on || undefined}>
      <div className="flex items-center justify-between px-8 pt-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Room plan</h1>
          <span className="text-[13.5px] text-mk-muted">Top view, drawn to scale</span>
        </div>
        <ZoomControls
          percent={Math.round(zoom * 100)}
          onZoomIn={() => zoomAt(1.25)}
          onZoomOut={() => zoomAt(0.8)}
          onFit={() => setView(null)}
        />
      </div>

      <PlanToolbar fullView={fullView} />

      <div ref={boxRef} className="relative min-h-0 flex-1">
        <svg
          ref={svgRef}
          className="absolute inset-0 size-full touch-none select-none"
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => !gesture.current && setGhost(null)}
          onWheel={(e) => zoomAt(Math.exp(-e.deltaY * 0.0015), toWorld(e))}
          role="img"
          aria-label="Room plan"
        >
          <PlanBase
            room={room}
            frames={frames}
            outline={outline}
            dims={dims}
            vb={vb}
            px={px}
            closed={closed}
            roomCentre={roomCentre}
            selectedWallId={selectedWallId}
            selectedFeatureId={selectedFeatureId}
            hoverWallId={ghost?.kind === "wall" ? ghost.wallId : null}
            dragging={drag}
            onWallClick={onWallClick}
            onGapClick={(wallId) => selectWall(wallId)}
            onFeaturePointerDown={startFeatureDrag}
          />
          {n === 0 && (
            <text x={fit.x + fit.w / 2} y={fit.y + fit.h / 2} textAnchor="middle" fontSize={font(14)} fill={C.faint}>
              Add Wall A to start drawing the room
            </text>
          )}

          {/* Open room: free ends and a dashed preview of the closing walls */}
          {hint && n > 0 && (
            <g pointerEvents="none">
              {(() => {
                let at = outline.inner[outline.inner.length - 1];
                return hint.walls.map((w, i) => {
                  const d = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } }[w.heading];
                  const to = { x: at.x + d.x * w.lengthMm, y: at.y + d.y * w.lengthMm };
                  const from = at;
                  at = to;
                  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
                  return (
                    <g key={i}>
                      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={hint.valid ? C.warn : C.bad} strokeWidth={2} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
                      <text x={mid.x + font(8)} y={mid.y - font(8)} fontSize={font(11)} className="num" fill={hint.valid ? C.warn : C.bad}>
                        {mm(w.lengthMm)}
                      </text>
                    </g>
                  );
                });
              })()}
              {!addingWall &&
                [outline.inner[0], outline.inner[outline.inner.length - 1]].map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={font(5)} fill="white" stroke={C.warn} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                ))}
            </g>
          )}

          {/* The next wall's preview, from its start end, at the typed length */}
          {from &&
            wallDraft.direction &&
            (() => {
              const d = headingVector(wallDraft.direction);
              const to = { x: from.point.x + d.x * wallDraft.lengthMm, y: from.point.y + d.y * wallDraft.lengthMm };
              const mid = { x: (from.point.x + to.x) / 2, y: (from.point.y + to.y) / 2 };
              return (
                <g pointerEvents="none" data-wall-preview>
                  <line x1={from.point.x} y1={from.point.y} x2={to.x} y2={to.y} stroke={C.accent} strokeWidth={2} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
                  <text x={mid.x + font(8)} y={mid.y - font(8)} fontSize={font(11)} className="num" fill={C.accentInk}>
                    {mm(wallDraft.lengthMm)}
                  </text>
                </g>
              );
            })()}

          {/* Free ends: click one to start the next wall there; click it again for the default */}
          {ends.map((e) => {
            const key = `${e.wallId}:${e.side}`;
            const current = sameEnd(e, from);
            const big = hoverEnd === key || current;
            const pick = () => setWallStart(sameEnd(e, wallStart) ? null : { wallId: e.wallId, side: e.side });
            return (
              <g
                key={key}
                role="button"
                tabIndex={0}
                aria-label={`Start from ${endPhrase(room, e)}`}
                aria-pressed={current}
                data-free-end={key}
                data-current={current || undefined}
                className="cursor-pointer"
                onPointerDown={(ev) => ev.stopPropagation()}
                onPointerEnter={() => setHoverEnd(key)}
                onPointerLeave={() => setHoverEnd(null)}
                onClick={pick}
                onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && pick()}
              >
                {/* A 12 px snap radius around a 10 px handle */}
                <circle cx={e.point.x} cy={e.point.y} r={font(12)} fill="transparent" />
                <circle
                  cx={e.point.x}
                  cy={e.point.y}
                  r={font(big ? 7 : 5)}
                  fill={current ? C.accent : "white"}
                  stroke={C.accent}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <title>{`Start from ${endPhrase(room, e)}`}</title>
              </g>
            );
          })}

          {/* The selected open segment: draw its wall back in, or close what is left of it */}
          {(() => {
            const i = walls.findIndex((w) => w.id === selectedWallId && w.open);
            if (i < 0) return null;
            if (walls[i].gapMm && !gapClosure(room, walls[i].id)?.valid) return null;
            const a = outline.inner[i];
            const b = outline.inner[(i + 1) % outline.inner.length];
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const toward = { x: roomCentre.x - mid.x, y: roomCentre.y - mid.y };
            const horizontal = a.y === b.y;
            const at = horizontal ? { x: mid.x, y: mid.y + Math.sign(toward.y) * font(26) } : { x: mid.x + Math.sign(toward.x) * font(62), y: mid.y };
            const drawnInto = !!walls[i].gapMm;
            const text = drawnInto ? "Close gap" : `Draw Wall ${walls[i].id}`;
            const w = font(text.length * 6.8 + 22);
            const fill = () => {
              if (drawnInto) projectStore.getState().closeGap(walls[i].id);
              else projectStore.getState().fillGap(walls[i].id);
              notifyRecheck(drawnInto ? undefined : [walls[i].id]);
            };
            return (
              <g
                role="button"
                aria-label={text}
                tabIndex={0}
                data-draw-gap={walls[i].id}
                className="cursor-pointer"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={fill}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fill()}
              >
                <rect x={at.x - w / 2} y={at.y - font(12)} width={w} height={font(24)} rx={font(12)} fill={C.accent} />
                <text x={at.x} y={at.y + font(4)} textAnchor="middle" fontSize={font(12)} fill="white" fontWeight={600}>
                  + {text}
                </text>
              </g>
            );
          })()}

          {/* Placement ghosts */}
          {ghost?.kind === "opening" &&
            (() => {
              const frame = frameOf(ghost.wallId);
              if (!frame) return null;
              const band = wallRect(frame, ghost.offset, ghost.offset + ghost.width, -WALL_THICKNESS_MM, 0);
              const label = wallToWorld(frame, ghost.offset + ghost.width / 2, 260);
              return (
                <g pointerEvents="none">
                  <polygon points={pts(band)} fill="var(--mk-accent-soft)" stroke={C.accent} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                  <text x={label.x} y={label.y} textAnchor="middle" fontSize={font(11)} className="num" fill={C.accentInk}>
                    {openingKind} {ghost.width} · @ {mm(ghost.offset)}
                  </text>
                </g>
              );
            })()}
          {ghost?.kind === "plumbing" &&
            (() => {
              const frame = frameOf(ghost.wallId);
              if (!frame) return null;
              const c = wallToWorld(frame, ghost.offset, 170);
              return <circle cx={c.x} cy={c.y} r={font(9)} fill="var(--mk-accent-soft)" stroke={C.accent} strokeDasharray="3 2" strokeWidth={1.4} vectorEffect="non-scaling-stroke" pointerEvents="none" />;
            })()}
          {ghost?.kind === "column" && (
            <rect
              x={ghost.x}
              y={ghost.y}
              width={COLUMN_SIZE}
              height={COLUMN_SIZE}
              fill={ghost.ok ? "var(--mk-accent-soft)" : "var(--mk-bad-soft)"}
              stroke={ghost.ok ? C.accent : C.bad}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}

          {/* Live offset while dragging */}
          {drag &&
            (() => {
              const f = room.features.find((x) => x.id === drag.featureId);
              if (!f || !("wallId" in f)) return null;
              const frame = frameOf(f.wallId);
              if (!frame) return null;
              const w = f.kind === "window" || f.kind === "door" ? f.widthMm : 0;
              const at = wallToWorld(frame, drag.offset + w / 2, -WALL_THICKNESS_MM - 160);
              const text = `${mm(drag.offset)} mm from left`;
              const tw = font(text.length * 6.6 + 14);
              return (
                <g pointerEvents="none">
                  <rect x={at.x - tw / 2} y={at.y - font(11)} width={tw} height={font(20)} rx={font(4)} fill={drag.valid ? C.accent : C.bad} />
                  <text x={at.x} y={at.y + font(3.5)} textAnchor="middle" fontSize={font(11)} className="num" fill="white">
                    {text}
                  </text>
                </g>
              );
            })()}
        </svg>

        {/* Scale bar */}
        <div className="pointer-events-none absolute right-8 bottom-4 flex flex-col items-center gap-1">
          <div className="flex h-2 items-stretch border-x border-mk-ink-2" style={{ width: 1000 / px }}>
            <div className="mt-1 flex-1 border-t border-mk-ink-2" />
            <div className="w-px bg-mk-ink-2" />
            <div className="mt-1 flex-1 border-t border-mk-ink-2" />
          </div>
          <span className="num text-[10.5px] text-mk-faint">1000 mm</span>
        </div>

        {/* Opening popover, anchored at the click */}
        {popover && (
          <div
            className="absolute z-20 w-80 rounded-lg bg-mk-panel p-3.5 shadow-lg ring-1 ring-black/10"
            style={{ left: Math.min(Math.max(8, popover.x - 160), size.w - 328), top: Math.min(popover.y + 14, size.h - 300) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <FeatureForm
              feature={popover.feature}
              isNew
              allowOpeningSwitch
              onCancel={() => {
                setPopover(null);
                finishTool();
              }}
              onSave={(f) => {
                const draft: Partial<Feature> = { ...f };
                delete draft.id;
                const id = projectStore.getState().addFeature(draft as NewFeature);
                selectFeature(id);
                notifyRecheck("wallId" in f ? [f.wallId] : undefined);
                setPopover(null);
                finishTool();
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
