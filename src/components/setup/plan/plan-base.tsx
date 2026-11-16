"use client";

// The room as drawn in plan: floor, walls, features, ceiling label and dimension lines.
// Shared by Room Setup (editable) and the Design screen's plan tab (read-only, with units).

import { roomOutline, wallToWorld, type WallFrame } from "@/domain/geometry";
import type { Feature, Point, Room } from "@/domain/types";
import { WALL_THICKNESS_MM } from "@/domain/zones";
import { ductBoxRect, featureCanvasLabel, mm } from "@/lib/room-format";
import type { DimLine, InlineLabel, ViewBox } from "./plan-geometry";

export const C = {
  wall: "var(--mk-wall)",
  accent: "var(--mk-accent)",
  accentInk: "var(--mk-accent-ink)",
  ink: "var(--mk-ink)",
  ink2: "var(--mk-ink-2)",
  faint: "#b3ada3",
  hatch: "#a9a39a",
  grid: "#efece6",
  warn: "var(--mk-warn)",
  bad: "var(--mk-bad)",
};

export const pts = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(" ");

/** Four corners of a wall-local rectangle (along × depth) in world coordinates. */
export function wallRect(f: WallFrame, a0: number, a1: number, d0: number, d1: number): Point[] {
  return [wallToWorld(f, a0, d0), wallToWorld(f, a1, d0), wallToWorld(f, a1, d1), wallToWorld(f, a0, d1)];
}

/** Offset of a wall feature, or undefined for column/duct box. */
export function featureOffset(f: Feature): number | undefined {
  return f.kind === "window" || f.kind === "door" || f.kind === "plumbing" ? f.offsetMm : undefined;
}

export interface PlanBaseProps {
  room: Room;
  frames: WallFrame[];
  outline: ReturnType<typeof roomOutline>;
  dims: { lines: DimLine[]; inline: InlineLabel[] };
  /** Visible area and mm per screen pixel, so strokes and text keep a constant screen size. */
  vb: ViewBox;
  px: number;
  closed: boolean;
  /** A label spot inside the room (ceiling label, fallback markers). */
  roomCentre: Point;
  selectedWallId: string | null;
  selectedFeatureId?: string | null;
  hoverWallId?: string | null;
  /** A feature being dragged: drawn at this offset, red when invalid. */
  dragging?: { featureId: string; offset: number; valid: boolean } | null;
  /** Numbered markers with labels next to each feature. */
  showMarkers?: boolean;
  /** The "CEILING 2850" label in the middle of a closed room. */
  showCeiling?: boolean;
  onWallClick?: (frame: WallFrame, e: React.MouseEvent) => void;
  /** Click on an open segment (a deleted wall's place, drawn dashed). */
  onGapClick?: (wallId: string, e: React.MouseEvent) => void;
  onFeaturePointerDown?: (f: Feature, e: React.PointerEvent) => void;
  /** Drawn on the floor, under walls and features (e.g. unit footprints). */
  children?: React.ReactNode;
}

export function PlanBase({
  room,
  frames,
  outline,
  dims,
  vb,
  px,
  closed,
  roomCentre,
  selectedWallId,
  selectedFeatureId = null,
  hoverWallId = null,
  dragging: drag = null,
  showMarkers = true,
  showCeiling = true,
  onWallClick,
  onGapClick,
  onFeaturePointerDown,
  children,
}: PlanBaseProps) {
  const walls = room.walls;
  const ceiling = room.ceilingHeightMm;
  const innerPoly = outline.inner;
  const font = (n: number) => n * px;
  const frameOf = (id: string) => frames.find((f) => f.wallId === id);
  const offsetOf = (f: Feature) => (drag?.featureId === f.id ? drag.offset : featureOffset(f));
  const featureStroke = (f: Feature, base: string) =>
    drag?.featureId === f.id && !drag.valid ? C.bad : selectedFeatureId === f.id ? C.accent : base;

  const marker = (key: string, num: number, at: Point, label: string, active: boolean, direction?: "left" | "right") => {
    if (!showMarkers) return null;
    const leftward = direction ? direction === "left" : at.x > roomCentre.x + 200;
    const r = font(10);
    return (
      <g key={key} pointerEvents="none">
        <circle cx={at.x} cy={at.y} r={r} fill="white" stroke={active ? C.accent : C.ink2} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        <text x={at.x} y={at.y + font(3.8)} fontSize={font(10.5)} textAnchor="middle" className="num" fill={active ? C.accentInk : C.ink}>
          {num}
        </text>
        <text
          x={at.x + (leftward ? -1 : 1) * font(15)}
          y={at.y + font(4)}
          fontSize={font(12)}
          textAnchor={leftward ? "end" : "start"}
          className="num"
          fill={active ? C.accentInk : C.ink2}
        >
          {label}
        </text>
      </g>
    );
  };

  const renderDim = (d: DimLine) => {
    const horiz = d.side === "top" || d.side === "bottom";
    const sign = d.side === "top" || d.side === "left" ? -1 : 1;
    const tick = (p: Point) => {
      const k = font(5);
      return <line x1={p.x - k} y1={p.y + k} x2={p.x + k} y2={p.y - k} stroke={C.ink2} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />;
    };
    const mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
    const gap = font(d.letter ? 9 : 7);
    const t = horiz ? { x: mid.x, y: mid.y + (sign < 0 ? -gap : gap + font(9)) } : { x: mid.x + sign * (gap + font(sign > 0 ? 9 : 0)), y: mid.y };
    const rotate = horiz ? undefined : `rotate(${sign < 0 ? -90 : 90} ${t.x} ${t.y})`;
    const selected = d.wallId && d.wallId === selectedWallId;
    return (
      <g key={d.key} pointerEvents="none">
        {d.extensions.map(([p, q], i) => (
          <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={C.faint} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y} stroke={C.ink2} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
        {tick(d.a)}
        {tick(d.b)}
        <text x={t.x} y={t.y} transform={rotate} textAnchor="middle" fontSize={font(11)} className="num" fill={selected ? C.accentInk : C.ink2}>
          {d.letter && (
            <tspan fontWeight={600} fill={selected ? C.accentInk : C.ink}>
              {d.letter}{" "}
            </tspan>
          )}
          {mm(d.value)}
        </text>
      </g>
    );
  };

  return (
    <>
      <defs>
        <pattern id="plan-hatch" patternUnits="userSpaceOnUse" width={font(9)} height={font(9)} patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={font(9)} stroke={C.hatch} strokeWidth={font(1)} />
        </pattern>
        <pattern id="plan-grid" patternUnits="userSpaceOnUse" width="250" height="250" x="0" y="0">
          <path d="M 250 0 L 0 0 0 250" fill="none" stroke={C.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
        <clipPath id="plan-room">
          <polygon points={pts(innerPoly)} />
        </clipPath>
      </defs>

      {/* Floor and grid */}
      {innerPoly.length > 2 && (
        <>
          <polygon points={pts(innerPoly)} fill={closed ? "white" : "#fbfaf8"} />
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#plan-grid)" clipPath="url(#plan-room)" pointerEvents="none" />
        </>
      )}

      {children}

      {/* Duct boxes (hatched) */}
      {room.features.map((f) => {
        if (f.kind !== "ductBox") return null;
        const r = ductBoxRect(room, f);
        if (!r) return null;
        return (
          <rect
            key={f.id}
            x={r.minX}
            y={r.minY}
            width={r.maxX - r.minX}
            height={r.maxY - r.minY}
            fill="url(#plan-hatch)"
            stroke={featureStroke(f, C.wall)}
            strokeWidth={selectedFeatureId === f.id ? 2.5 : 0}
            vectorEffect="non-scaling-stroke"
            onPointerDown={(e) => onFeaturePointerDown?.(f, e)}
          />
        );
      })}

      {/* Walls */}
      {frames.map((f) => {
        const i = f.index; // chain index: open segments keep their place in the outline
        const a = outline.inner[i];
        const b = outline.inner[(i + 1) % outline.inner.length];
        const oa = outline.outer[i];
        const ob = outline.outer[(i + 1) % outline.outer.length];
        const selected = f.wallId === selectedWallId;
        const hovered = hoverWallId === f.wallId;
        return (
          <polygon
            key={f.wallId}
            points={pts([a, b, ob, oa])}
            fill={selected ? C.accent : hovered ? C.accentInk : C.wall}
            stroke={selected ? C.accent : C.wall}
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
            className={onWallClick ? "cursor-pointer" : undefined}
            onPointerDown={(e) => onWallClick && e.stopPropagation()}
            onClick={(e) => onWallClick?.(f, e)}
          >
            <title>{`Wall ${f.wallId} · ${f.lengthMm} mm`}</title>
          </polygon>
        );
      })}

      {/* Open segments: a deleted wall's place, dashed, with its letter and length */}
      {walls.map((w, i) => {
        if (!w.open) return null;
        const a = outline.inner[i];
        const b = outline.inner[(i + 1) % outline.inner.length];
        if (!a || !b) return null;
        const selected = w.id === selectedWallId;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const horizontal = a.y === b.y;
        // Label outside the room: away from the room centre.
        const away = horizontal ? { x: 0, y: Math.sign(mid.y - roomCentre.y) || -1 } : { x: Math.sign(mid.x - roomCentre.x) || -1, y: 0 };
        const at = { x: mid.x + away.x * font(26), y: mid.y + away.y * font(18) + font(4) };
        return (
          <g key={`gap-${w.id}`} data-gap={w.id} className={onGapClick ? "cursor-pointer" : undefined} onPointerDown={(e) => onGapClick && e.stopPropagation()} onClick={(e) => onGapClick?.(w.id, e)}>
            {/* A wide invisible hit line, so the dashed line is easy to click */}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected ? C.accent : C.warn} strokeWidth={selected ? 3 : 2} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
            <text
              x={at.x}
              y={at.y}
              textAnchor={horizontal ? "middle" : away.x < 0 ? "end" : "start"}
              fontSize={font(11)}
              className="num"
              fill={selected ? C.accentInk : C.warn}
              pointerEvents="none"
            >
              <tspan fontWeight={600}>{w.id}</tspan> · {mm(w.lengthMm)} · open
            </text>
            <title>{`Wall ${w.id} is open · ${w.lengthMm} mm`}</title>
          </g>
        );
      })}

      {/* Selected wall: end markers and direction arrow, as in the mockup */}
      {(() => {
        const f = selectedWallId ? frameOf(selectedWallId) : undefined;
        const seg = f && walls.findIndex((w) => w.id === f.wallId);
        if (!f || seg === undefined || seg < 0) return null;
        const s = outline.inner[seg];
        const e = outline.inner[(seg + 1) % outline.inner.length];
        const dir = { x: Math.sign(e.x - s.x), y: Math.sign(e.y - s.y) };
        const out = { x: -f.n.x * (WALL_THICKNESS_MM / 2), y: -f.n.y * (WALL_THICKNESS_MM / 2) };
        const k = font(5);
        const sq = (p: Point, key: string) => (
          <rect key={key} x={p.x + out.x - k} y={p.y + out.y - k} width={2 * k} height={2 * k} fill="white" pointerEvents="none" />
        );
        const tip = { x: e.x + out.x + dir.x * font(34), y: e.y + out.y + dir.y * font(34) };
        const base = { x: e.x + out.x + dir.x * font(12), y: e.y + out.y + dir.y * font(12) };
        const head = font(5);
        return (
          <g pointerEvents="none">
            {sq({ x: s.x + dir.x * font(9), y: s.y + dir.y * font(9) }, "s")}
            {sq({ x: e.x - dir.x * font(9), y: e.y - dir.y * font(9) }, "e")}
            <line x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} stroke={C.accent} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <polyline
              points={pts([
                { x: tip.x - dir.x * head - dir.y * head, y: tip.y - dir.y * head + dir.x * head },
                tip,
                { x: tip.x - dir.x * head + dir.y * head, y: tip.y - dir.y * head - dir.x * head },
              ])}
              fill="none"
              stroke={C.accent}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })()}

      {/* Wall features */}
      {room.features.map((f, idx) => {
        const num = idx + 1;
        const active = selectedFeatureId === f.id;
        if (f.kind === "window" || f.kind === "door") {
          const frame = frameOf(f.wallId);
          if (!frame) return null;
          const o = offsetOf(f)!;
          const stroke = featureStroke(f, C.ink2);
          const band = wallRect(frame, o, o + f.widthMm, -WALL_THICKNESS_MM, 0);
          const mid = o + f.widthMm / 2;
          if (f.kind === "window") {
            return (
              <g key={f.id} className="cursor-grab" onPointerDown={(e) => onFeaturePointerDown?.(f, e)}>
                <polygon points={pts(band)} fill="white" stroke={stroke} strokeWidth={active ? 2 : 1} vectorEffect="non-scaling-stroke" />
                {[-25, -50, -75].map((d) => {
                  const p = wallToWorld(frame, o, d);
                  const q = wallToWorld(frame, o + f.widthMm, d);
                  return <line key={d} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={stroke} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />;
                })}
                {marker(`m-${f.id}`, num, wallToWorld(frame, mid - 120, 360), featureCanvasLabel(f), active)}
              </g>
            );
          }
          const hinge = wallToWorld(frame, o, 0);
          const leafTip = wallToWorld(frame, o, f.widthMm);
          const jamb = wallToWorld(frame, o + f.widthMm, 0);
          // Arc from the leaf tip round to the far jamb, radius = door width.
          const cross = (leafTip.x - hinge.x) * (jamb.y - hinge.y) - (leafTip.y - hinge.y) * (jamb.x - hinge.x);
          return (
            <g key={f.id} className="cursor-grab" onPointerDown={(e) => onFeaturePointerDown?.(f, e)}>
              <polygon points={pts(band)} fill="white" stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <line x1={hinge.x} y1={hinge.y} x2={leafTip.x} y2={leafTip.y} stroke={stroke} strokeWidth={active ? 2.5 : 2} vectorEffect="non-scaling-stroke" />
              <path
                d={`M ${leafTip.x} ${leafTip.y} A ${f.widthMm} ${f.widthMm} 0 0 ${cross > 0 ? 1 : 0} ${jamb.x} ${jamb.y}`}
                fill="none"
                stroke={stroke}
                strokeWidth={0.9}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
              {marker(`m-${f.id}`, num, wallToWorld(frame, mid, f.widthMm + 140), featureCanvasLabel(f), active)}
            </g>
          );
        }
        if (f.kind === "plumbing") {
          const frame = frameOf(f.wallId);
          if (!frame) return null;
          const c = wallToWorld(frame, offsetOf(f)!, 170);
          const r = font(9);
          const stroke = featureStroke(f, C.ink);
          const k = r * 0.7;
          return (
            <g key={f.id} className="cursor-grab" onPointerDown={(e) => onFeaturePointerDown?.(f, e)}>
              <circle cx={c.x} cy={c.y} r={r} fill="white" stroke={stroke} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              <line x1={c.x - k} y1={c.y - k} x2={c.x + k} y2={c.y + k} stroke={stroke} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              <line x1={c.x - k} y1={c.y + k} x2={c.x + k} y2={c.y - k} stroke={stroke} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              {marker(`m-${f.id}`, num, { x: c.x + font(24), y: c.y }, featureCanvasLabel(f), active, "right")}
            </g>
          );
        }
        if (f.kind === "beam") {
          const frame = frameOf(f.wallId);
          if (!frame) return null;
          const p = wallToWorld(frame, 0, f.depthMm);
          const q = wallToWorld(frame, frame.lengthMm, f.depthMm);
          const stroke = featureStroke(f, C.ink2);
          const hit = wallRect(frame, 0, frame.lengthMm, 0, f.depthMm);
          return (
            <g key={f.id} onPointerDown={(e) => onFeaturePointerDown?.(f, e)} className="cursor-pointer">
              <polygon points={pts(hit)} fill="transparent" />
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={stroke} strokeWidth={active ? 2 : 1.3} strokeDasharray="7 5" vectorEffect="non-scaling-stroke" />
              {marker(`m-${f.id}`, num, wallToWorld(frame, frame.lengthMm * 0.3, f.depthMm + 110), featureCanvasLabel(f), active)}
            </g>
          );
        }
        if (f.kind === "column") {
          return (
            <g key={f.id} className="cursor-pointer" onPointerDown={(e) => onFeaturePointerDown?.(f, e)}>
              <rect
                x={f.x}
                y={f.y}
                width={f.widthMm}
                height={f.depthMm}
                fill="url(#plan-hatch)"
                stroke={featureStroke(f, C.wall)}
                strokeWidth={active ? 3 : 2.2}
                vectorEffect="non-scaling-stroke"
              />
              {marker(`m-${f.id}`, num, { x: f.x + f.widthMm + font(20), y: f.y + f.depthMm / 2 }, featureCanvasLabel(f), active)}
            </g>
          );
        }
        if (f.kind === "ductBox") {
          const r = ductBoxRect(room, f);
          const at = r ? { x: r.minX + font(10), y: r.minY - font(18) } : { x: roomCentre.x, y: roomCentre.y + font(30) };
          return marker(`m-${f.id}`, num, at, featureCanvasLabel(f), active);
        }
        return null;
      })}

      {/* Ceiling label */}
      {closed && showCeiling && (
        <text x={roomCentre.x} y={roomCentre.y} textAnchor="middle" fontSize={font(11)} className="num" fill={C.faint} letterSpacing={font(1.2)} pointerEvents="none">
          CEILING {mm(ceiling)}
        </text>
      )}

      {/* Dimensions */}
      {dims.lines.map(renderDim)}
      {dims.inline.map((l) => (
        <text
          key={l.key}
          x={l.at.x}
          y={l.at.y + font(4)}
          textAnchor={l.side === "left" ? "start" : l.side === "right" ? "end" : "middle"}
          fontSize={font(11)}
          className="num"
          fill={l.wallId === selectedWallId ? C.accentInk : C.ink2}
          pointerEvents="none"
        >
          <tspan fontWeight={600} fill={l.wallId === selectedWallId ? C.accentInk : C.ink}>
            {l.letter}{" "}
          </tspan>
          {mm(l.value)}
        </text>
      ))}

    </>
  );
}
