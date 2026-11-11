// Pure layout for the Room Setup plan: fit box and architectural dimension lines, in world mm.

import { roomOutline, wallFrames, wallToWorld, type WallFrame } from "@/domain/geometry";
import type { Point, Room } from "@/domain/types";
import { WALL_THICKNESS_MM } from "@/domain/zones";

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Room bounding box padded for the dimension lines; a default sheet if there are no walls. */
export function fitBox(room: Room): ViewBox {
  const { outer, inner } = roomOutline(room, WALL_THICKNESS_MM);
  const pts = [...outer, ...inner];
  if (pts.length < 2) return { x: -1500, y: -1500, w: 6000, h: 4500 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = 950;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
}

export type Side = "top" | "right" | "bottom" | "left";

export interface DimLine {
  key: string;
  a: Point; // ends on the dimension line
  b: Point;
  /** Extension lines from the wall's outer face to just past the dimension line. */
  extensions: [Point, Point][];
  side: Side;
  /** Text: wall letter (emphasised) and length. */
  letter?: string;
  value: number;
  wallId?: string;
}

export interface InlineLabel {
  key: string;
  at: Point;
  side: Side;
  letter: string;
  value: number;
  wallId: string;
}

const SEGMENT_ROW = 250; // beyond the wall's outer face
const WALL_ROW = 550;
const OVERALL_ROW = 850;
const OVERSHOOT = 60;

function sideOf(f: WallFrame): Side {
  const ox = -f.n.x;
  const oy = -f.n.y;
  if (oy < 0) return "top";
  if (oy > 0) return "bottom";
  return ox < 0 ? "left" : "right";
}

const horizontal = (s: Side) => s === "top" || s === "bottom";

/**
 * Dimension lines outside the room. Walls whose outside faces the room's bounding edge (or
 * that don't collide with one on that edge's row) get a row dimension, so C, E and G share
 * the bottom row; recessed walls that would collide (the duct-box sides) get an inline label.
 * Walls with windows/doors get an extra row of segment dimensions.
 */
export function dimensionPlan(room: Room): { lines: DimLine[]; inline: InlineLabel[] } {
  const frames = wallFrames(room);
  if (!frames.length) return { lines: [], inline: [] };
  const { inner } = roomOutline(room, WALL_THICKNESS_MM);
  const minX = Math.min(...inner.map((p) => p.x));
  const maxX = Math.max(...inner.map((p) => p.x));
  const minY = Math.min(...inner.map((p) => p.y));
  const maxY = Math.max(...inner.map((p) => p.y));
  const edge: Record<Side, number> = { top: minY, bottom: maxY, left: minX, right: maxX };
  const out: Record<Side, Point> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

  const span = (f: WallFrame): [number, number] => {
    const a = wallToWorld(f, 0);
    const b = wallToWorld(f, f.lengthMm);
    const [p, q] = horizontal(sideOf(f)) ? [a.x, b.x] : [a.y, b.y];
    return [Math.min(p, q), Math.max(p, q)];
  };
  const face = (f: WallFrame) => (horizontal(sideOf(f)) ? f.origin.y : f.origin.x);
  const atEdge = (f: WallFrame) => face(f) === edge[sideOf(f)];

  const lines: DimLine[] = [];
  const inline: InlineLabel[] = [];

  /** A dimension along `side` between two along-side coordinates, `dist` beyond the edge. */
  const rowLine = (key: string, side: Side, from: number, to: number, faceAt: number, dist: number, value: number, extra: Partial<DimLine> = {}): DimLine => {
    const o = out[side];
    const rowAt = edge[side] + (horizontal(side) ? o.y : o.x) * (WALL_THICKNESS_MM + dist);
    const pt = (t: number, at: number): Point => (horizontal(side) ? { x: t, y: at } : { x: at, y: t });
    const faceOut = faceAt + (horizontal(side) ? o.y : o.x) * WALL_THICKNESS_MM;
    const past = rowAt + (horizontal(side) ? o.y : o.x) * OVERSHOOT;
    return {
      key,
      side,
      a: pt(from, rowAt),
      b: pt(to, rowAt),
      extensions: [
        [pt(from, faceOut), pt(from, past)],
        [pt(to, faceOut), pt(to, past)],
      ],
      value,
      ...extra,
    };
  };

  for (const f of frames) {
    const side = sideOf(f);
    const [s0, s1] = span(f);
    const edgeWalls = frames.filter((g) => g !== f && sideOf(g) === side && atEdge(g));
    const collides = edgeWalls.some((g) => {
      const [g0, g1] = span(g);
      return g0 < s1 && s0 < g1;
    });

    if (atEdge(f) || !collides) {
      lines.push(rowLine(`wall-${f.wallId}`, side, s0, s1, face(f), WALL_ROW, f.lengthMm, { letter: f.wallId, wallId: f.wallId }));
    } else {
      const mid = wallToWorld(f, f.lengthMm / 2, 220);
      inline.push({ key: `inline-${f.wallId}`, at: mid, side, letter: f.wallId, value: f.lengthMm, wallId: f.wallId });
    }

    // Segment row for openings on edge walls: wall start → opening edges → wall end.
    const openings = room.features.filter((x) => (x.kind === "window" || x.kind === "door") && x.wallId === f.wallId);
    if (openings.length && atEdge(f)) {
      const cuts = new Set<number>([0, f.lengthMm]);
      for (const o of openings) {
        if (o.kind !== "window" && o.kind !== "door") continue;
        cuts.add(Math.max(0, Math.min(f.lengthMm, o.offsetMm)));
        cuts.add(Math.max(0, Math.min(f.lengthMm, o.offsetMm + o.widthMm)));
      }
      const sorted = [...cuts].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
        const p = wallToWorld(f, sorted[i]);
        const q = wallToWorld(f, sorted[i + 1]);
        const [t0, t1] = horizontal(side) ? [p.x, q.x] : [p.y, q.y];
        lines.push(rowLine(`seg-${f.wallId}-${i}`, side, Math.min(t0, t1), Math.max(t0, t1), face(f), SEGMENT_ROW, sorted[i + 1] - sorted[i]));
      }
    }
  }

  // Overall width and depth, only when no single wall already states them.
  const width = maxX - minX;
  const depth = maxY - minY;
  const has = (side: Side, value: number) => lines.some((l) => l.side === side && l.letter && l.value === value);
  if (!has("top", width) && !has("bottom", width)) lines.push(rowLine("overall-w", "top", minX, maxX, minY, OVERALL_ROW, width, { letter: "Overall" }));
  if (!has("left", depth) && !has("right", depth)) lines.push(rowLine("overall-d", "left", minY, maxY, minX, OVERALL_ROW, depth, { letter: "Overall" }));

  return { lines, inline };
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A label spot well inside the room: the sampled interior point furthest from every wall. */
export function labelPoint(innerPoly: Point[]): Point {
  if (innerPoly.length < 3) return { x: 0, y: 0 };
  const xs = innerPoly.map((p) => p.x);
  const ys = innerPoly.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const clearance = (p: Point) => {
    let d = Infinity;
    for (let i = 0; i < innerPoly.length; i++) {
      const a = innerPoly[i];
      const b = innerPoly[(i + 1) % innerPoly.length];
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1)));
      d = Math.min(d, Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))));
    }
    return d;
  };
  let best = centre;
  let bestScore = pointInPolygon(centre, innerPoly) ? clearance(centre) : -1;
  for (let i = 1; i < 20; i++) {
    for (let j = 1; j < 20; j++) {
      const p = { x: x0 + ((x1 - x0) * i) / 20, y: y0 + ((y1 - y0) * j) / 20 };
      if (!pointInPolygon(p, innerPoly)) continue;
      // Prefer the middle when clearances are close.
      const score = clearance(p) - Math.hypot(p.x - centre.x, p.y - centre.y) * 0.05;
      if (score > bestScore + 1) {
        best = p;
        bestScore = score;
      }
    }
  }
  return best;
}
