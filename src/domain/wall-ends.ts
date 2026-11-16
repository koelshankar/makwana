// Starting a new wall from a free end (Feedback 2, item 1). Pure.
//
// The room stays one ordered list of walls and gaps. A free end is the end of a standing wall where
// no standing wall meets it: the open chain's two ends, and the two sides of every gap. Drawing from
// one inserts the new wall next to that end and shrinks the gap (or moves the room's start, from
// Wall A's start), so every existing corner stays where it is. Only joined ends have no handle:
// branches and T-junctions are out of scope.

import { headingVector, isChainClosed, roomStart, roomVertices, wallVector } from "./geometry";
import { OPPOSITE } from "./room-validation";
import type { Heading, Point, Room, Wall } from "./types";

export type EndSide = "start" | "end";

/** Which end of which wall. */
export interface EndRef {
  wallId: string;
  side: EndSide;
}

export interface FreeEnd extends EndRef {
  point: Point;
  /** The wall's heading: a new wall turns a right angle off it. */
  heading: Heading;
  /** The open chain's end or start, or the end of a wall before a gap, or the start of one after it. */
  kind: "chainEnd" | "chainStart" | "beforeGap" | "afterGap";
  gapId?: string;
}

export const sameEnd = (a: EndRef | null | undefined, b: EndRef | null | undefined) => !!a && !!b && a.wallId === b.wallId && a.side === b.side;

/** Every free end, in room order (walking the walls from Wall A's start). */
export function freeEnds(room: Room): FreeEnd[] {
  const walls = room.walls;
  const n = walls.length;
  if (!n) return [];
  const verts = roomVertices(room);
  const closed = isChainClosed(room);
  const out: FreeEnd[] = [];
  for (let i = 0; i <= (closed ? n - 1 : n); i++) {
    const before = i > 0 ? walls[i - 1] : closed ? walls[n - 1] : undefined;
    const after = i < n ? walls[i] : undefined;
    const beforeStands = !!before && !before.open;
    const afterStands = !!after && !after.open;
    if (beforeStands && !afterStands) {
      out.push({ wallId: before.id, side: "end", point: verts[i], heading: before.heading, kind: after ? "beforeGap" : "chainEnd", gapId: after?.id });
    } else if (afterStands && !beforeStands) {
      out.push({ wallId: after.id, side: "start", point: verts[i], heading: after.heading, kind: before ? "afterGap" : "chainStart", gapId: before?.id });
    }
  }
  return out;
}

/** Where a new wall starts when no end is picked: the chain's end (as before), else the first free end. */
export function defaultFreeEnd(room: Room): FreeEnd | null {
  const ends = freeEnds(room);
  return ends.find((e) => e.kind === "chainEnd") ?? ends[0] ?? null;
}

export interface NewWallDraft {
  /** The direction it is drawn in, away from the end it starts at. */
  direction: Heading;
  lengthMm: number;
  label?: string;
}

export interface DrawResult {
  room: Room;
  /** The new wall's far end (as drawn). Free unless the new wall joined. */
  far: EndRef;
  /** The new wall closed its own gap exactly, or closed the chain: it meets a wall there. */
  joined: boolean;
}

const plus = (p: Point, q: Point): Point => ({ x: p.x + q.x + 0, y: p.y + q.y + 0 });

/** A gap after its far end moved by `step`; null once nothing is left of it. */
function shrunk(gap: Wall, step: Point): Wall | null {
  const v = plus(wallVector(gap), step);
  if (v.x === 0 && v.y === 0) return null;
  return { ...gap, gapMm: { dx: v.x, dy: v.y }, lengthMm: Math.abs(v.x) + Math.abs(v.y) };
}

/**
 * Draws a wall from a free end (or, with no walls yet, from the room's start). Every existing vertex
 * stays where it is. It joins another wall only when it ends exactly on its own gap's other end (or
 * closes the chain); anything else it touches stays open, which validation reports.
 */
export function drawFromEnd(room: Room, end: FreeEnd | null, draft: NewWallDraft, id: string): DrawResult {
  const v = headingVector(draft.direction);
  const step = { x: v.x * draft.lengthMm, y: v.y * draft.lengthMm };
  const forward: Wall = { id, heading: draft.direction, lengthMm: draft.lengthMm, ...(draft.label ? { label: draft.label } : {}) };
  // Drawn back towards a wall's start: travel runs the other way.
  const backward: Wall = { ...forward, heading: OPPOSITE[draft.direction] };
  const walls = [...room.walls];

  if (!end || end.kind === "chainEnd") {
    const next = { ...room, walls: [...walls, forward] };
    return { room: next, far: { wallId: id, side: "end" }, joined: isChainClosed(next) };
  }
  if (end.kind === "chainStart") {
    const next = { ...room, walls: [backward, ...walls], start: plus(roomStart(room), step) };
    return { room: next, far: { wallId: id, side: "start" }, joined: isChainClosed(next) };
  }
  const gi = walls.findIndex((w) => w.id === end.gapId);
  const gap = walls[gi];
  if (end.kind === "beforeGap") {
    // The gap now starts at the new wall's end.
    const left = shrunk(gap, { x: -step.x, y: -step.y });
    walls.splice(gi, 1, forward, ...(left ? [left] : []));
    return { room: { ...room, walls }, far: { wallId: id, side: "end" }, joined: !left };
  }
  // afterGap: the gap now ends where the new wall (travelling back to the wall's start) begins.
  const left = shrunk(gap, step);
  walls.splice(gi, 1, ...(left ? [left] : []), backward);
  return { room: { ...room, walls }, far: { wallId: id, side: "start" }, joined: !left };
}

/** The end a new wall starts from: the picked one while it is still free (an undo can join it), else the default. */
export function startEnd(room: Room, picked: EndRef | null): FreeEnd | null {
  return (picked && freeEnds(room).find((e) => sameEnd(e, picked))) || defaultFreeEnd(room);
}
