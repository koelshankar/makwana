// Magnetic snapping for dragging a unit along a wall. Pure.

import { getContext, occupancy } from "./rules/context";
import type { Catalogue, Layer, Project } from "./types";

export const GRID_MM = 10;

export type SnapKind = "neighbour" | "runEnd" | "feature" | "grid";

/** Snap targets along one wall for one layer, grouped by priority. */
export interface SnapTargets {
  lengthMm: number;
  /** Occupied ranges in the layer band (units on any wall, columns, doors), excluding the dragged unit. */
  occupied: [number, number][];
  /** Ranges of units on this wall and layer: the dragged unit abuts these. */
  neighbours: [number, number][];
  /** Ranges that end the usable run: corner zones (units from the adjacent wall), columns, doors. */
  runEnds: [number, number][];
  /** Window edges and plumbing points: the unit may align either edge with these. */
  features: number[];
}

export function snapTargets(project: Project, cat: Catalogue, wallId: string, layer: Layer, excludeId?: string): SnapTargets {
  const wall = project.room.walls.find((w) => w.id === wallId);
  const lengthMm = wall?.lengthMm ?? 0;
  const occ = occupancy(getContext(project, cat), wallId, layer, excludeId);
  const features: number[] = [];
  for (const f of project.room.features) {
    if (f.kind === "window" && f.wallId === wallId) features.push(f.offsetMm, f.offsetMm + f.widthMm);
    if (f.kind === "plumbing" && f.wallId === wallId) features.push(f.offsetMm);
  }
  return {
    lengthMm,
    occupied: occ.map((o) => o.along),
    neighbours: occ.filter((o) => o.own).map((o) => o.along),
    runEnds: occ.filter((o) => !o.own).map((o) => o.along),
    features,
  };
}

export interface Snap {
  offsetMm: number;
  kind: SnapKind;
}

/**
 * Snaps a raw offset for a unit of `widthMm`. Each class of target is tried in priority order
 * (a free wall end, then neighbour edges, then other run ends, then feature edges) and the nearest
 * candidate within `thresholdMm` wins; otherwise the offset rounds to the 10 mm grid.
 *
 * A wall end comes first so a unit dropped near the end of a wall lands there even when a
 * neighbour's edge is also in reach (BC1000 at the end of wall A, 100 mm past SU900, at 1366 px
 * where 8 px is 87 mm). Only a free end counts: one where the unit would overlap nothing.
 */
export function snapOffset(raw: number, widthMm: number, t: SnapTargets, thresholdMm: number, magnets = true): Snap {
  if (magnets) {
    const abut = (ranges: [number, number][]) => ranges.flatMap(([a0, a1]) => [a1, a0 - widthMm]);
    const free = (c: number) => !t.occupied.some(([a0, a1]) => a0 < c + widthMm && c < a1);
    const classes: [SnapKind, number[]][] = [
      ["runEnd", [0, t.lengthMm - widthMm].filter(free)],
      ["neighbour", abut(t.neighbours)],
      ["runEnd", abut(t.runEnds)],
      ["feature", t.features.flatMap((e) => [e, e - widthMm])],
    ];
    for (const [kind, candidates] of classes) {
      let best: number | null = null;
      for (const c of candidates) {
        const d = Math.abs(c - raw);
        if (d <= thresholdMm && (best === null || d < Math.abs(best - raw))) best = c;
      }
      if (best !== null) return { offsetMm: Math.round(best), kind };
    }
  }
  return { offsetMm: Math.round(raw / GRID_MM) * GRID_MM, kind: "grid" };
}

/**
 * Clear distance from a unit at [offset, offset + width] to the nearest occupied range (or the
 * wall end) on each side. Null on a side where the unit already overlaps something.
 */
export function neighbourGaps(offsetMm: number, widthMm: number, t: SnapTargets): { left: number | null; right: number | null } {
  const end = offsetMm + widthMm;
  let left: number | null = offsetMm;
  let right: number | null = t.lengthMm - end;
  for (const [a0, a1] of t.occupied) {
    if (a0 < end && offsetMm < a1) {
      // Overlapping: whichever side it intrudes from has no clear gap.
      if (a0 <= offsetMm) left = null;
      if (a1 >= end) right = null;
      continue;
    }
    if (a1 <= offsetMm && left !== null) left = Math.min(left, offsetMm - a1);
    if (a0 >= end && right !== null) right = Math.min(right, a0 - end);
  }
  return { left: left !== null && left < 0 ? null : left, right: right !== null && right < 0 ? null : right };
}
