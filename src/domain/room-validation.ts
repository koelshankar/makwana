// Pure checks for the Room Setup screen: is this room ready for design, and how would it close?

import { isChainClosed, roomVertices, wallFrames } from "./geometry";
import type { Feature, Heading, Point, Rect, Room, Wall } from "./types";

export interface RoomIssue {
  featureId?: string;
  wallId?: string;
  message: string;
}

export interface RoomValidation {
  ok: boolean;
  issues: RoomIssue[];
}

const OPPOSITE: Record<Heading, Heading> = { N: "S", S: "N", E: "W", W: "E" };
const isVertical = (h: Heading) => h === "N" || h === "S";

/** Headings allowed for a wall following `prev`: the two at right angles to it. */
export function perpendicularHeadings(prev: Heading | undefined): Heading[] {
  if (!prev) return ["N", "E", "S", "W"];
  return isVertical(prev) ? ["E", "W"] : ["N", "S"];
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** True if an axis-aligned rectangle lies inside an orthogonal polygon (touching edges is fine). */
export function rectInsidePolygon(r: Rect, poly: Point[]): boolean {
  const centre = { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 };
  if (!pointInPolygon(centre, poly)) return false;
  // No wall may pass through the rectangle's interior.
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a.y === b.y) {
      if (a.y > r.minY && a.y < r.maxY && Math.max(a.x, b.x) > r.minX && Math.min(a.x, b.x) < r.maxX) return false;
    } else if (a.x > r.minX && a.x < r.maxX && Math.max(a.y, b.y) > r.minY && Math.min(a.y, b.y) < r.maxY) {
      return false;
    }
  }
  return true;
}

export function featureWallId(f: Feature): string | undefined {
  return "wallId" in f ? f.wallId : undefined;
}

/** Validates the room for design. Every message is written for a salesperson. */
export function validateRoom(room: Room): RoomValidation {
  const issues: RoomIssue[] = [];
  // Open segments are not walls: features can't be on them.
  const walls = new Map(room.walls.filter((w) => !w.open).map((w) => [w.id, w]));

  if (room.walls.length === 0) issues.push({ message: "Add the room's walls, starting with Wall A." });

  room.walls.forEach((w, i) => {
    if (!(w.lengthMm > 0)) issues.push({ wallId: w.id, message: `Wall ${w.id} needs a length.` });
    const prev = room.walls[i - 1];
    if (prev && !perpendicularHeadings(prev.heading).includes(w.heading)) {
      issues.push({ wallId: w.id, message: `Wall ${w.id} must turn a right angle from Wall ${prev.id}.` });
    }
  });

  // The chain returns to its start; the shape (and so the floor) is known even with gaps in it.
  const closed = isChainClosed(room);
  for (const gap of roomGaps(room)) {
    issues.push({ wallId: gap.wallId, message: `Wall ${gap.wallId} is open: draw a wall in the ${gap.lengthMm} mm gap${gap.between}.` });
  }
  if (room.walls.length > 0 && !closed) {
    const hint = closingHint(room);
    const gap = hint ? ` (open by ${hint.summary})` : "";
    issues.push({ message: `The room isn't closed yet${gap}.` });
  }
  if (closed) {
    const first = room.walls[0];
    const last = room.walls[room.walls.length - 1];
    if (!perpendicularHeadings(last.heading).includes(first.heading)) {
      issues.push({ wallId: last.id, message: `Wall ${last.id} must meet Wall ${first.id} at a right angle.` });
    }
  }

  if (!(room.ceilingHeightMm > 0)) issues.push({ message: "Set the ceiling height." });
  const ceiling = room.ceilingHeightMm;

  const onWall = (f: Feature): Wall | undefined => {
    const id = featureWallId(f);
    if (id === undefined) return undefined;
    const wall = walls.get(id);
    if (!wall) issues.push({ featureId: f.id, message: `${describe(f)} is on Wall ${id}, which no longer exists.` });
    return wall;
  };

  const span = (f: Feature, wall: Wall, offset: number, width: number) => {
    if (offset < 0 || offset + width > wall.lengthMm) {
      issues.push({
        featureId: f.id,
        message: `${describe(f)} (${offset}–${offset + width} mm) doesn't fit on Wall ${wall.id}, which is ${wall.lengthMm} mm long.`,
      });
    }
  };

  for (const f of room.features) {
    const wall = onWall(f);
    switch (f.kind) {
      case "window":
        if (wall) span(f, wall, f.offsetMm, f.widthMm);
        if (f.widthMm <= 0) issues.push({ featureId: f.id, message: "The window needs a width." });
        if (!(f.sillMm < f.topMm)) issues.push({ featureId: f.id, message: "The window sill must be below its top." });
        if (f.topMm > ceiling) issues.push({ featureId: f.id, message: `The window top (${f.topMm} mm) is above the ceiling (${ceiling} mm).` });
        break;
      case "door":
        if (wall) span(f, wall, f.offsetMm, f.widthMm);
        if (f.widthMm <= 0) issues.push({ featureId: f.id, message: "The door needs a width." });
        if (f.heightMm > ceiling) issues.push({ featureId: f.id, message: `The door (${f.heightMm} mm) is taller than the ceiling (${ceiling} mm).` });
        break;
      case "plumbing":
        if (wall) span(f, wall, f.offsetMm, 0);
        break;
      case "beam":
        if (f.bottomMm > ceiling) issues.push({ featureId: f.id, message: `The beam bottom (${f.bottomMm} mm) is above the ceiling (${ceiling} mm).` });
        if (f.depthMm <= 0) issues.push({ featureId: f.id, message: "The beam needs a depth." });
        break;
      case "column": {
        const rect = { minX: f.x, maxX: f.x + f.widthMm, minY: f.y, maxY: f.y + f.depthMm };
        if (closed && !rectInsidePolygon(rect, roomVertices(room).slice(0, -1))) {
          issues.push({ featureId: f.id, message: "The column is outside the room." });
        }
        break;
      }
      case "ductBox":
        for (const id of [f.fromWallId, f.toWallId]) {
          if (id && !walls.has(id)) issues.push({ featureId: f.id, message: `The duct box refers to Wall ${id}, which no longer exists.` });
        }
        break;
    }
  }

  return { ok: issues.length === 0, issues };
}

export const FEATURE_NAMES: Record<Feature["kind"], string> = {
  window: "Window",
  door: "Door",
  plumbing: "Plumbing",
  column: "Column",
  beam: "Beam",
  ductBox: "Duct box",
};

function describe(f: Feature): string {
  return FEATURE_NAMES[f.kind];
}

// ---------------------------------------------------------------------------

export interface ClosingHint {
  /** From the last wall's end back to the origin. */
  dx: number;
  dy: number;
  /** One or two right-angle walls that would close the room, in order. */
  walls: { heading: Heading; lengthMm: number }[];
  /** False if those walls would double back on Wall A or the last wall (the shape needs rethinking). */
  valid: boolean;
  /** e.g. "450 mm × 600 mm" or "600 mm". */
  summary: string;
}

export interface RoomGap {
  /** The open segment: the deleted wall's letter, length and heading. */
  wallId: string;
  lengthMm: number;
  heading: Heading;
  /** e.g. " between Wall B and Wall D", or "" when it has no standing neighbour. */
  between: string;
}

/** The open segments left by deleted walls, with their standing neighbours, in chain order. */
export function roomGaps(room: Room): RoomGap[] {
  const n = room.walls.length;
  const chainClosed = isChainClosed(room);
  return room.walls.flatMap((w, i) => {
    if (!w.open) return [];
    const prev = i > 0 || chainClosed ? room.walls[(i - 1 + n) % n] : undefined;
    const next = i < n - 1 || chainClosed ? room.walls[(i + 1) % n] : undefined;
    const names = [prev, next].filter((x) => x && !x.open).map((x) => `Wall ${x!.id}`);
    const between = names.length === 2 ? ` between ${names[0]} and ${names[1]}` : names.length === 1 ? ` next to ${names[0]}` : "";
    return [{ wallId: w.id, lengthMm: w.lengthMm, heading: w.heading, between }];
  });
}

/**
 * For a room whose chain of walls doesn't return to its start, how far it is from closing and
 * which walls would close it. Null once the chain closes (gaps are reported by roomGaps).
 */
export function closingHint(room: Room): ClosingHint | null {
  if (room.walls.length === 0 || isChainClosed(room)) return null;
  const end = roomVertices(room)[room.walls.length];
  const dx = 0 - end.x; // not -end.x, which gives -0
  const dy = 0 - end.y;
  const horizontal = dx === 0 ? null : { heading: (dx > 0 ? "E" : "W") as Heading, lengthMm: Math.abs(dx) };
  const vertical = dy === 0 ? null : { heading: (dy > 0 ? "S" : "N") as Heading, lengthMm: Math.abs(dy) };

  const last = room.walls[room.walls.length - 1].heading;
  // The first closing wall must turn off the last wall.
  const ordered = isVertical(last) ? [horizontal, vertical] : [vertical, horizontal];
  const walls = ordered.filter((w): w is { heading: Heading; lengthMm: number } => w !== null);

  const first = room.walls[0].heading;
  const headings = [last, ...walls.map((w) => w.heading), first];
  const valid = headings.every((h, i) => i === 0 || (h !== headings[i - 1] && h !== OPPOSITE[headings[i - 1]]));

  const parts = [Math.abs(dy), Math.abs(dx)].filter((n) => n > 0).map((n) => `${n} mm`);
  return { dx, dy, walls, valid, summary: parts.join(" × ") };
}

/** Wall ids at each room corner, e.g. "A/H", for describing positions. */
export function cornerNames(room: Room): { point: Point; name: string }[] {
  const verts = roomVertices(room);
  const closed = isChainClosed(room);
  const n = room.walls.length;
  return wallFrames(room).flatMap((f) => {
    if (f.index === 0 && !closed) return [];
    const prev = room.walls[(f.index - 1 + n) % n];
    if (prev.open) return []; // no corner at an open segment
    return [{ point: verts[f.index], name: `${f.wallId}/${prev.id}` }];
  });
}
