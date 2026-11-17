// Feedback 2, item 1: a new wall can start at any free end. Every existing corner stays put; a wall
// joins only when it exactly closes its own gap.

import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";
import { insideCorners, isChainClosed, isRoomClosed, roomVertices, wallFrames, type WallFrame } from "./geometry";
import { isUsableProject } from "./project-validation";
import { crossingWalls, gapClosure, roomGaps, validateRoom } from "./room-validation";
import { emptyMehta } from "./seed";
import type { Room } from "./types";
import { defaultFreeEnd, drawFromEnd, endName, endPhrase, freeEnds, type FreeEnd } from "./wall-ends";

const mehta = emptyMehta.room;
const openWall = (room: Room, ...ids: string[]): Room => ({
  ...room,
  walls: room.walls.map((w) => (ids.includes(w.id) ? { ...w, open: true as const } : w)),
  features: room.features.filter((f) => !("wallId" in f) || !ids.includes(f.wallId)),
});
const gapC = openWall(mehta, "C");
const openChain: Room = { ...mehta, walls: mehta.walls.slice(0, 3), features: [] };
const ends = (room: Room) => freeEnds(room).map((e) => `${e.wallId}:${e.side}:${e.kind}`);
const end = (room: Room, wallId: string, side: "start" | "end"): FreeEnd => freeEnds(room).find((e) => e.wallId === wallId && e.side === side)!;

/** Every vertex, frame and so every feature position of the room before is unchanged after. */
function expectNothingMoved(before: Room, after: Room) {
  const oldVerts = roomVertices(before);
  const newVerts = roomVertices(after);
  for (const p of oldVerts) expect(newVerts, `vertex ${p.x},${p.y}`).toContainEqual(p);
  const frames = new Map(wallFrames(after).map((f) => [f.wallId, f]));
  const strip = ({ wallId, origin, u, n, lengthMm }: WallFrame) => ({ wallId, origin, u, n, lengthMm });
  for (const f of wallFrames(before)) expect(strip(frames.get(f.wallId)!)).toEqual(strip(f));
}

describe("free ends", () => {
  it("a closed room has none", () => {
    expect(freeEnds(mehta)).toEqual([]);
    expect(defaultFreeEnd(mehta)).toBeNull();
  });

  it("a gap has one at each side; an open chain at its start and end; in room order", () => {
    expect(ends(gapC)).toEqual(["B:end:beforeGap", "D:start:afterGap"]);
    expect(end(gapC, "B", "end").point).toEqual({ x: 3200, y: 2400 });
    expect(ends(openChain)).toEqual(["A:start:chainStart", "C:end:chainEnd"]);
    expect(ends(openWall(mehta, "C", "G"))).toEqual(["B:end:beforeGap", "D:start:afterGap", "F:end:beforeGap", "H:start:afterGap"]);
    // A gap at Wall A wraps round to H.
    expect(ends(openWall(mehta, "A"))).toEqual(["H:end:beforeGap", "B:start:afterGap"]);
  });

  it("the default with no click is the chain's end, as before; otherwise the first free end", () => {
    expect(defaultFreeEnd(openChain)).toMatchObject({ wallId: "C", side: "end" });
    expect(defaultFreeEnd(gapC)).toMatchObject({ wallId: "B", side: "end" });
  });
});

describe("end names (what the panel and the plan's tooltips say)", () => {
  const name = (room: Room, wallId: string, side: "start" | "end") => endName(room, { wallId, side });

  it("a joined end is named by the wall that meets it, whichever way the walls were drawn", () => {
    expect(name(mehta, "B", "start")).toBe("End at Wall A");
    expect(name(mehta, "B", "end")).toBe("End at Wall C");
    // Wall A's start meets the last wall when the room is closed.
    expect(name(mehta, "A", "start")).toBe("End at Wall H");
    expect(name(mehta, "H", "end")).toBe("End at Wall A");
  });

  it("an end at a gap or at the open end of the room is a free end", () => {
    expect(name(gapC, "B", "end")).toBe("Free end");
    expect(name(gapC, "D", "start")).toBe("Free end");
    expect(name(gapC, "B", "start")).toBe("End at Wall A");
    expect(name(openChain, "A", "start")).toBe("Free end");
    expect(name(openChain, "C", "end")).toBe("Free end");
    expect(freeEnds(gapC).map((e) => endPhrase(gapC, e))).toEqual(["Wall B's free end", "Wall D's free end"]);
    expect(endPhrase(mehta, { wallId: "B", side: "start" })).toBe("Wall B's end at Wall A");
  });

  it("a wall with both ends free: the side of the plan tells them apart (north is always up)", () => {
    // C and E deleted: Wall D (450, drawn north, so up the plan) stands alone between two gaps.
    const lone = openWall(mehta, "C", "E");
    expect(name(lone, "D", "start")).toBe("Free end (bottom)");
    expect(name(lone, "D", "end")).toBe("Free end (top)");
    const single: Room = { ...mehta, walls: mehta.walls.slice(0, 1), features: [] };
    expect([name(single, "A", "start"), name(single, "A", "end")]).toEqual(["Free end (left)", "Free end (right)"]);
  });
});

describe("drawing from a free end", () => {
  it("from the chain's end: appended, as before", () => {
    const r = drawFromEnd(openChain, end(openChain, "C", "end"), { direction: "N", lengthMm: 450 }, "D");
    expect(r.room.walls.map((w) => `${w.id}${w.heading}${w.lengthMm}`)).toEqual(["AE3200", "BS2400", "CW1600", "DN450"]);
    expect(r.far).toEqual({ wallId: "D", side: "end" });
    expect(r.joined).toBe(false);
    expectNothingMoved(openChain, r.room);
  });

  it("from Wall A's start: drawn backwards, the room's start moves, nothing else does", () => {
    const r = drawFromEnd(openChain, end(openChain, "A", "start"), { direction: "S", lengthMm: 1000 }, "D");
    // Stored as travelled: from (0, 1000) north to Wall A's start.
    expect(r.room.walls[0]).toEqual({ id: "D", heading: "N", lengthMm: 1000 });
    expect(r.room.start).toEqual({ x: 0, y: 1000 });
    expect(r.far).toEqual({ wallId: "D", side: "start" });
    expectNothingMoved(openChain, r.room);
    expect(ends(r.room)).toEqual(["D:start:chainStart", "C:end:chainEnd"]);
  });

  it("from the end of the wall before a gap: inserted before it; the gap shrinks", () => {
    const r = drawFromEnd(gapC, end(gapC, "B", "end"), { direction: "W", lengthMm: 1000 }, "I");
    expect(r.room.walls.map((w) => w.id)).toEqual(["A", "B", "I", "C", "D", "E", "F", "G", "H"]);
    expect(r.room.walls[3]).toMatchObject({ id: "C", open: true, gapMm: { dx: -600, dy: 0 }, lengthMm: 600 });
    expect(r.far).toEqual({ wallId: "I", side: "end" });
    expect(r.joined).toBe(false);
    expectNothingMoved(gapC, r.room);
  });

  it("from the start of the wall after a gap: inserted after it, stored travelling back to that wall", () => {
    const r = drawFromEnd(gapC, end(gapC, "D", "start"), { direction: "E", lengthMm: 600 }, "I");
    expect(r.room.walls.map((w) => w.id)).toEqual(["A", "B", "C", "I", "D", "E", "F", "G", "H"]);
    expect(r.room.walls[3]).toEqual({ id: "I", heading: "W", lengthMm: 600 });
    expect(r.room.walls[2]).toMatchObject({ id: "C", gapMm: { dx: -1000, dy: 0 } });
    expect(r.far).toEqual({ wallId: "I", side: "start" });
    expectNothingMoved(gapC, r.room);
  });

  it("joins when it ends exactly on its own gap's other end: the room closes and is ready", () => {
    for (const [from, direction] of [[end(gapC, "B", "end"), "W"], [end(gapC, "D", "start"), "E"]] as const) {
      const r = drawFromEnd(gapC, from, { direction, lengthMm: 1600 }, "I");
      expect(r.joined).toBe(true);
      expect(r.room.walls.some((w) => w.open)).toBe(false);
      expect(isRoomClosed(r.room)).toBe(true);
      expect(validateRoom(r.room)).toEqual({ ok: true, issues: [] });
      expectNothingMoved(gapC, r.room);
    }
  });

  it("anything else it touches doesn't join: past the gap's end it runs into Wall D and the room stays open", () => {
    const r = drawFromEnd(gapC, end(gapC, "B", "end"), { direction: "W", lengthMm: 2000 }, "I");
    expect(r.joined).toBe(false);
    expect(crossingWalls(r.room)).toEqual([["D", "I"]]);
    const v = validateRoom(r.room);
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.message)).toContain("Wall I runs into Wall D.");
    expect(v.issues.map((i) => i.message)).toContain("The room is open between Wall I and Wall D (400 mm).");
  });

  it("a wall drawn into a gap, then turned, leaves an L-shaped gap that Close gap can fill when the turns work", () => {
    // A 4000 × 3000 box with Wall B deleted; walls drawn in from both sides.
    const box: Room = {
      walls: [
        { id: "A", heading: "E", lengthMm: 4000 },
        { id: "B", heading: "S", lengthMm: 3000, open: true },
        { id: "C", heading: "W", lengthMm: 4000 },
        { id: "D", heading: "N", lengthMm: 3000 },
      ],
      ceilingHeightMm: 2700,
      features: [],
    };
    let room = drawFromEnd(box, end(box, "A", "end"), { direction: "S", lengthMm: 1000 }, "E").room;
    room = drawFromEnd(room, end(room, "E", "end"), { direction: "W", lengthMm: 500 }, "F").room;
    room = drawFromEnd(room, end(room, "C", "start"), { direction: "N", lengthMm: 500 }, "G").room;
    expect(room.walls.map((w) => w.id)).toEqual(["A", "E", "F", "B", "G", "C", "D"]);
    expect(roomGaps(room)).toMatchObject([{ wallId: "B", drawnInto: true, summary: "1500 mm × 500 mm", between: " between Wall F and Wall G" }]);
    expect(validateRoom(room).issues[0].message).toBe("The room is open between Wall F and Wall G (1500 mm × 500 mm).");
    expect(gapClosure(room, "B")).toEqual({ walls: [{ heading: "S", lengthMm: 1500 }, { heading: "E", lengthMm: 500 }], valid: true });
    expectNothingMoved(box, room);
  });

  it("a gap drawn into is not a deleted wall any more: no plain Draw wall", () => {
    const r = drawFromEnd(gapC, end(gapC, "B", "end"), { direction: "W", lengthMm: 1000 }, "I");
    expect(roomGaps(r.room)[0]).toMatchObject({ wallId: "C", drawnInto: true, summary: "600 mm" });
    // The straight 600 mm left can't be one wall: it would carry straight on from Wall I.
    expect(gapClosure(r.room, "C")).toEqual({ walls: [{ heading: "W", lengthMm: 600 }], valid: false });
  });

  it("a corner made by a wall drawn from a clicked free end is an inside corner like any other", () => {
    const r = drawFromEnd(gapC, end(gapC, "D", "start"), { direction: "E", lengthMm: 1600 }, "I");
    expect(insideCorners(r.room).map((c) => `${c.fromWallId}${c.toWallId}`)).toEqual(["AB", "BI", "ID", "FG", "GH", "HA"]);
    expect(insideCorners(r.room).find((c) => c.fromWallId === "B")!.point).toEqual({ x: 3200, y: 2400 });
  });
});

describe("saves", () => {
  it("accept a gap's vector and the room's start, and nothing malformed", () => {
    const drawn = drawFromEnd(openChain, end(openChain, "A", "start"), { direction: "S", lengthMm: 1000 }, "D").room;
    const gapped = drawFromEnd(gapC, end(gapC, "B", "end"), { direction: "W", lengthMm: 1000 }, "I").room;
    for (const room of [drawn, gapped]) expect(isUsableProject({ ...emptyMehta, room }, catalogue)).toBe(true);
    const bad = (patch: Partial<Room>) => isUsableProject({ ...emptyMehta, room: { ...mehta, ...patch } }, catalogue);
    expect(bad({ start: { x: 0.5, y: 0 } })).toBe(false);
    expect(bad({ walls: mehta.walls.map((w) => (w.id === "C" ? { ...w, gapMm: { dx: -1600, dy: 0 } } : w)) })).toBe(false); // standing wall
    expect(bad({ walls: mehta.walls.map((w) => (w.id === "C" ? { ...w, open: true as const, gapMm: { dx: 0, dy: 0 } } : w)) })).toBe(false);
  });

  it("a room with no gap vectors and no start is unchanged in shape: (0, 0) as before", () => {
    expect(roomVertices(mehta)[0]).toEqual({ x: 0, y: 0 });
    expect(isChainClosed(mehta)).toBe(true);
  });
});
