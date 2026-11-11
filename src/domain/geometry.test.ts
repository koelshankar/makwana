import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";
import {
  boxesIntersect,
  countertopOutline,
  isRoomClosed,
  placementToWorldBox,
  rectArea,
  roomOutline,
  roomVertices,
  signedArea,
  wallFrames,
  wallSegments,
  wallToWorld,
  worldToWall,
} from "./geometry";
import { emptyMehta, sampleDesign } from "./seed";
import { unit } from "./testing";
import type { Heading, ModulePlacement, Point, Project, Room } from "./types";

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Same rectangle drawn counter-clockwise on screen: down, right, up, left. */
const ccwRoom: Room = {
  walls: [
    { id: "A", lengthMm: 3000, heading: "S" },
    { id: "B", lengthMm: 2000, heading: "E" },
    { id: "C", lengthMm: 3000, heading: "N" },
    { id: "D", lengthMm: 2000, heading: "W" },
  ],
  ceilingHeightMm: 2700,
  features: [],
};

describe("room geometry", () => {
  it("closes the seed room exactly", () => {
    expect(isRoomClosed(emptyMehta.room)).toBe(true);
    expect(roomVertices(emptyMehta.room).at(-1)).toEqual({ x: 0, y: 0 });
    // 3200 × 2400 less the 600 × 450 duct-box notch; positive = clockwise on screen.
    expect(signedArea(emptyMehta.room)).toBe(3200 * 2400 - 600 * 450);
    expect(isRoomClosed(ccwRoom)).toBe(true);
    expect(signedArea(ccwRoom)).toBeLessThan(0);
  });

  it("reports an open room as not closed", () => {
    const open = { ...emptyMehta.room, walls: emptyMehta.room.walls.slice(0, 7) };
    expect(isRoomClosed(open)).toBe(false);
  });

  it.each([
    ["seed (clockwise)", emptyMehta.room],
    ["rectangle (counter-clockwise)", ccwRoom],
  ])("inward normals point inside for every wall of the %s room", (_, room) => {
    const poly = roomVertices(room).slice(0, -1);
    for (const s of wallSegments(room)) {
      const mid = { x: (s.start.x + s.end.x) / 2, y: (s.start.y + s.end.y) / 2 };
      const inside = { x: mid.x + s.inwardNormal.x * 10, y: mid.y + s.inwardNormal.y * 10 };
      const outside = { x: mid.x - s.inwardNormal.x * 10, y: mid.y - s.inwardNormal.y * 10 };
      expect(pointInPolygon(inside, poly), `wall ${s.wallId} inside`).toBe(true);
      expect(pointInPolygon(outside, poly), `wall ${s.wallId} outside`).toBe(false);
    }
  });

  // Standing inside, facing the wall: which world direction is on the viewer's left?
  const LEFT_WHEN_FACING: Record<Heading, Point> = {
    N: { x: -1, y: 0 },
    E: { x: 0, y: -1 },
    S: { x: 1, y: 0 },
    W: { x: 0, y: 1 },
  };
  const facingHeading = (n: Point): Heading =>
    n.y > 0 ? "N" : n.y < 0 ? "S" : n.x > 0 ? "W" : "E"; // facing is -n

  it.each([
    ["seed (clockwise)", emptyMehta.room],
    ["rectangle (counter-clockwise)", ccwRoom],
  ])("puts offset 0 on the left in elevation for every heading (%s)", (_, room) => {
    const headings = new Set(room.walls.map((w) => w.heading));
    expect(headings.size).toBe(4);
    for (const frame of wallFrames(room)) {
      const left = LEFT_WHEN_FACING[facingHeading(frame.n)];
      const p0 = wallToWorld(frame, 0);
      const p100 = wallToWorld(frame, 100);
      // Moving from offset 100 to offset 0 moves towards the viewer's left.
      expect((p0.x - p100.x) * left.x + (p0.y - p100.y) * left.y, `wall ${frame.wallId}`).toBe(100);
      // And offset 0 sits on a corner of the wall.
      const seg = wallSegments(room).find((s) => s.wallId === frame.wallId)!;
      expect([seg.start, seg.end]).toContainEqual(p0);
    }
  });

  it("round-trips world and wall-local coordinates", () => {
    for (const frame of wallFrames(emptyMehta.room)) {
      const p = wallToWorld(frame, 123, 45);
      const back = worldToWall(frame, p);
      expect(back.offsetMm).toBeCloseTo(123);
      expect(back.depthMm).toBeCloseTo(45);
    }
  });
});

describe("placementToWorldBox", () => {
  const withModules = (...modules: ModulePlacement[]): Project => ({ ...emptyMehta, modules });

  it("makes a blind corner on wall A and a B600 at offset 0 on wall B overlap; offset 560 clears", () => {
    const corner = unit("bc", "BC1000", "A", 2200, 1000);
    const atZero = unit("b6", "B600", "B", 0, 600);
    const p1 = withModules(corner, atZero);
    expect(placementToWorldBox(p1, corner, catalogue)).toEqual({ minX: 2200, maxX: 3200, minY: 0, maxY: 560, minZ: 0, maxZ: 820 });
    // With a blind side, the box also carries the blind section, tucked into the corner.
    const blind = placementToWorldBox(p1, { ...corner, blindSide: "right" }, catalogue);
    expect(blind.blindPart).toEqual({ minX: 2640, maxX: 3200, minY: 0, maxY: 560, minZ: 0, maxZ: 820 });
    expect(placementToWorldBox(p1, atZero, catalogue)).toEqual({ minX: 2640, maxX: 3200, minY: 0, maxY: 600, minZ: 0, maxZ: 820 });
    expect(boxesIntersect(placementToWorldBox(p1, corner), placementToWorldBox(p1, atZero))).toBe(true);

    const moved = { ...atZero, offsetMm: 560 };
    const p2 = withModules(corner, moved);
    expect(boxesIntersect(placementToWorldBox(p2, corner), placementToWorldBox(p2, moved))).toBe(false);
  });

  it("places units on the duct-box walls inside the room", () => {
    const poly = roomVertices(emptyMehta.room).slice(0, -1);
    for (const wallId of ["D", "E", "F"]) {
      const p = unit(`u-${wallId}`, "B300", wallId, 0, 300);
      const box = placementToWorldBox(withModules(p), p);
      const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
      expect(pointInPolygon(centre, poly), `wall ${wallId}`).toBe(true);
    }
  });

  it("derives hosted appliances from their host", () => {
    const sink = sampleDesign.appliances.find((a) => a.id === "a-sink")!;
    const box = placementToWorldBox(sampleDesign, sink);
    // SU900 at 1200–2100 on wall A: sink centred at 1650.
    expect((box.minX + box.maxX) / 2).toBe(1650);
    expect(box.maxZ).toBe(860);
  });
});

describe("roomOutline", () => {
  it("offsets an open room's free ends by their own wall only", () => {
    const room: Room = { ...emptyMehta.room, walls: [{ id: "A", lengthMm: 3000, heading: "E" }, { id: "B", lengthMm: 2000, heading: "S" }] };
    const { inner, outer } = roomOutline(room, 100);
    expect(inner).toEqual([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }]);
    expect(outer).toEqual([{ x: 0, y: -100 }, { x: 3100, y: -100 }, { x: 3100, y: 2000 }]);
  });
});

describe("countertopOutline", () => {
  it("covers each base run once, trimming the A/B corner, with sink and hob cut-outs", () => {
    const { slabs, cutOuts } = countertopOutline(sampleDesign, catalogue);
    expect(slabs).toEqual([
      { wallId: "A", rect: { minX: 300, maxX: 3200, minY: 0, maxY: 600 } },
      { wallId: "B", rect: { minX: 2600, maxX: 3200, minY: 600, maxY: 1800 } },
    ]);
    expect(slabs.reduce((s, x) => s + rectArea(x.rect), 0)).toBe(2900 * 600 + 1200 * 600);
    expect(cutOuts.map((c) => c.applianceId).sort()).toEqual(["hob", "sink"]);
    const hob = cutOuts.find((c) => c.applianceId === "hob")!;
    expect(hob.rect).toEqual({ minX: 750 - 365, maxX: 750 + 365, minY: 300 - 215, maxY: 300 + 215 });
  });
});
