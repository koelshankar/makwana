// Display strings for Room Setup. Every dimension is a plain integer in mm (no separators).

import { cornerNames } from "@/domain/room-validation";
import type { Feature, Room } from "@/domain/types";

export const mm = (n: number) => `${Math.round(n)}`;

export const FEATURE_TITLES: Record<Feature["kind"], string> = {
  window: "Window",
  door: "Door",
  plumbing: "Plumbing",
  column: "Column",
  beam: "Beam",
  ductBox: "Duct box",
};

/** One-line summary for the features list, e.g. "A · 900 W · sill 1050". */
export function featureSummary(room: Room, f: Feature): string {
  switch (f.kind) {
    case "window":
      return `${f.wallId} · ${mm(f.widthMm)} W · sill ${mm(f.sillMm)}`;
    case "door":
      return `${f.wallId} · ${mm(f.widthMm)} W`;
    case "plumbing": {
      const below = room.features.some(
        (w) => w.kind === "window" && w.wallId === f.wallId && f.offsetMm >= w.offsetMm && f.offsetMm <= w.offsetMm + w.widthMm,
      );
      return `${f.wallId} · ${below ? "below window" : `@ ${mm(f.offsetMm)}`}`;
    }
    case "column": {
      const corner = cornerNames(room).find(
        (c) =>
          (c.point.x === f.x || c.point.x === f.x + f.widthMm) && (c.point.y === f.y || c.point.y === f.y + f.depthMm),
      );
      const where = corner ? `${corner.name} corner` : `${mm(f.x)}, ${mm(f.y)}`;
      return `${where} · ${mm(f.widthMm)} × ${mm(f.depthMm)}`;
    }
    case "beam":
      return `${f.wallId} · bottom ${mm(f.bottomMm)}`;
    case "ductBox": {
      const size = ductBoxRect(room, f);
      const walls = f.fromWallId && f.toWallId ? `${f.fromWallId}–${f.toWallId}` : "label only";
      return size ? `${walls} · ${mm(size.maxX - size.minX)} × ${mm(size.maxY - size.minY)}` : walls;
    }
  }
}

/** Short label drawn next to a feature's marker on the plan. */
export function featureCanvasLabel(f: Feature): string {
  switch (f.kind) {
    case "window":
      return `Window · sill ${mm(f.sillMm)}`;
    case "door":
      return `Door ${mm(f.widthMm)}`;
    case "plumbing":
      return "Plumbing";
    case "column":
      return `Column ${mm(f.widthMm)} × ${mm(f.depthMm)}`;
    case "beam":
      return `Beam · bottom ${mm(f.bottomMm)}`;
    case "ductBox":
      return f.label || "Duct box";
  }
}

/** The duct box's extent: the bounding box of the walls from `fromWallId` to `toWallId`. */
export function ductBoxRect(room: Room, f: Extract<Feature, { kind: "ductBox" }>) {
  if (!f.fromWallId || !f.toWallId) return null;
  const from = room.walls.findIndex((w) => w.id === f.fromWallId);
  const to = room.walls.findIndex((w) => w.id === f.toWallId);
  if (from < 0 || to < from) return null;
  let x = 0;
  let y = 0;
  const pts: { x: number; y: number }[] = [];
  const step = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] } as const;
  room.walls.forEach((w, i) => {
    if (i >= from && i <= to) pts.push({ x, y });
    const [dx, dy] = step[w.heading];
    x += dx * w.lengthMm;
    y += dy * w.lengthMm;
    if (i >= from && i <= to) pts.push({ x, y });
  });
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

export const snap10 = (n: number) => Math.round(n / 10) * 10;
