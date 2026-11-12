import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";
import { boxesIntersect, wallBoxToWorld, wallFrame } from "./geometry";
import { emptyMehta, sampleDesign } from "./seed";
import { unit } from "./testing";
import {
  applianceParts,
  countertopModel,
  CUT_HEIGHT_MM,
  fittedParts,
  frontDivisions,
  REVEAL_MM,
  roomModel,
  unitParts,
  type BoxPart,
  type Front,
  type Part,
} from "./three-model";
import type { Box } from "./types";

const kinds = (fronts: Front[]) => fronts.map((f) => f.kind);
const boxes = (parts: Part[]) => parts.filter((p): p is BoxPart => p.kind === "box");
const volume = (b: Box) => (b.maxX - b.minX) * (b.maxY - b.minY) * (b.maxZ - b.minZ);

describe("frontDivisions", () => {
  it("shutter units: one door below 600 mm, two from 600", () => {
    expect(kinds(frontDivisions(unit("x", "B450", "A", 300, 450), catalogue))).toEqual(["door"]);
    expect(kinds(frontDivisions(unit("x", "B600", "A", 300, 600), catalogue))).toEqual(["door", "door"]);
    expect(kinds(frontDivisions(unit("x", "W900", "A", 300, 900, "wall"), catalogue))).toEqual(["door", "door"]);
    expect(kinds(frontDivisions(unit("x", "LS450", "A", 300, 450, "loft"), catalogue))).toEqual(["door"]);
    expect(kinds(frontDivisions(unit("x", "SU900", "A", 1200, 900), catalogue))).toEqual(["door", "door"]);
  });

  it("drawer units: BD two drawers, HU900 three, stacked over the body height", () => {
    const bd = frontDivisions(unit("x", "BD600", "B", 560, 600), catalogue);
    expect(kinds(bd)).toEqual(["drawer", "drawer"]);
    expect(bd.map((f) => f.z)).toEqual([
      [460, 820],
      [100, 460],
    ]);
    expect(kinds(frontDivisions(unit("x", "HU900", "A", 300, 900), catalogue))).toEqual(["drawer", "drawer", "drawer"]);
  });

  it("handles: vertical near the meeting edges of doors, horizontal across drawers and wall units", () => {
    const [l, r] = frontDivisions(unit("x", "B600", "A", 300, 600), catalogue);
    expect(l.handle!.along[0]).toBeGreaterThan(200); // near the middle
    expect(r.handle!.along[1]).toBeLessThan(400);
    expect(l.handle!.z[0]).toBeGreaterThan(500); // at the top of a base door
    const [d] = frontDivisions(unit("x", "BD600", "A", 300, 600), catalogue);
    expect(d.handle!.along[1] - d.handle!.along[0]).toBeGreaterThan(400);
    const [w] = frontDivisions(unit("x", "W600", "A", 300, 600, "wall"), catalogue);
    expect(w.handle!.z[1]).toBeLessThan(1500); // along the bottom of a wall unit
  });

  it("tall pantry: two stacked doors", () => {
    const tp = frontDivisions(unit("x", "TP600", "B", 0, 600, "tall"), catalogue);
    expect(kinds(tp)).toEqual(["door", "door"]);
    expect(tp[0].z[1]).toBe(tp[1].z[0]);
    expect(tp[0].along).toEqual([0, 600]);
  });

  it("T600OM: lower drawer, oven and microwave as glass at the housed heights", () => {
    const fronts = frontDivisions(unit("x", "T600OM", "B", 1800, 600, "tall"), catalogue, ["oven", "microwave"]);
    expect(kinds(fronts)).toEqual(["drawer", "glass", "panel", "glass", "door"]);
    expect(fronts[1]).toMatchObject({ appliance: "oven", z: [700, 1295] });
    expect(fronts[3]).toMatchObject({ appliance: "microwave", z: [1350, 1740] });
    // Without a microwave its slot is a plain panel.
    expect(kinds(frontDivisions(unit("x", "T600OM", "B", 1800, 600, "tall"), catalogue, ["oven"]))).toEqual(["drawer", "glass", "panel", "panel", "door"]);
  });

  it("blind corner: a plain blind panel on the blind side and a door on the rest", () => {
    const right = frontDivisions(unit("x", "BC1000", "A", 2200, 1000, "base", { blindSide: "right" }), catalogue);
    expect(right.map((f) => [f.kind, f.along])).toEqual([
      ["door", [0, 440]],
      ["blind", [440, 1000]],
    ]);
    expect(right[1].handle).toBeNull();
    const left = frontDivisions(unit("x", "BC1000", "A", 0, 1000, "base", { blindSide: "left" }), catalogue);
    expect(kinds(left)).toEqual(["blind", "door"]);
    expect(left[1].handle!.along[1]).toBeGreaterThan(900); // opens away from the corner
  });

  it("fillers are one flat panel", () => {
    expect(kinds(frontDivisions(unit("x", "FIL", "A", 2100, 100), catalogue))).toEqual(["panel"]);
  });
});

describe("unitParts", () => {
  it("carcass in off-white, fronts 18 mm proud in the finish with a 3 mm reveal, plinth set back 50", () => {
    const parts = boxes(unitParts(unit("x", "BD600", "A", 300, 600), catalogue));
    const carcass = parts.find((p) => p.key === "carcass")!;
    expect(carcass).toMatchObject({ material: "carcass", box: { along: [0, 600], depth: [0, 560], z: [100, 820] } });
    expect(parts.find((p) => p.key === "plinth")!.box).toEqual({ along: [0, 600], depth: [0, 510], z: [0, 100] });
    const fronts = parts.filter((p) => p.key.startsWith("front-"));
    expect(fronts.every((f) => f.material === "finish:matte-sage")).toBe(true);
    expect(fronts.every((f) => f.box.depth[0] === 560 && f.box.depth[1] === 578)).toBe(true);
    const [upper, lower] = fronts;
    expect(upper.box.z[0] - lower.box.z[1]).toBe(REVEAL_MM);
  });

  it("standard shutters get handle bars; handleless get a groove and no bars", () => {
    const std = boxes(unitParts(unit("x", "B600", "A", 300, 600), catalogue));
    expect(std.filter((p) => p.material === "handle")).toHaveLength(2);
    const hl = boxes(unitParts(unit("x", "B600", "A", 300, 600, "base", { shutterTypeId: "handleless" }), catalogue));
    expect(hl.filter((p) => p.material === "handle")).toHaveLength(0);
    const grooves = hl.filter((p) => p.material === "groove");
    expect(grooves).toHaveLength(2);
    expect(grooves[0].box.z[1] - grooves[0].box.z[0]).toBe(15);
  });

  it("fitted appliances are separate parts: sink, hob, and the T600OM's glass fronts", () => {
    const su = unit("x", "SU900", "A", 1200, 900);
    expect(unitParts(su, catalogue, ["sink"]).some((p) => p.key.startsWith("tap") || p.key.startsWith("sink"))).toBe(false);
    expect(fittedParts(su, catalogue, "sink").some((p) => p.key === "tap-stem")).toBe(true);
    expect(fittedParts(unit("x", "HU900", "A", 300, 900), catalogue, "hob").filter((p) => p.kind === "ring")).toHaveLength(4);
    const tall = unit("x", "T600OM", "B", 1800, 600, "tall");
    expect(boxes(unitParts(tall, catalogue, ["oven", "microwave"])).filter((p) => p.material === "glass")).toHaveLength(0);
    const oven = boxes(fittedParts(tall, catalogue, "oven"));
    expect(oven).toEqual([expect.objectContaining({ material: "glass", box: expect.objectContaining({ z: [701.5, 1293.5] }) })]);
  });

  it("fillers draw no carcass, only a finish panel", () => {
    const parts = boxes(unitParts(unit("x", "FIL", "A", 2100, 100, "wall"), catalogue));
    expect(parts.map((p) => p.material)).toEqual(["finish:matte-sage"]);
  });
});

describe("applianceParts", () => {
  it("chimney: hood, taper and flue up to the wall-unit line", () => {
    const parts = applianceParts(catalogue.appliances.find((a) => a.id === "chimney")!, "matte-sage");
    expect(parts.map((p) => p.kind)).toEqual(["box", "taper", "box"]);
    expect((parts[2] as BoxPart).box.z[1]).toBe(2100);
  });

  it("dishwasher wears the base finish; refrigerator space is an outline only", () => {
    const dw = applianceParts(catalogue.appliances.find((a) => a.id === "dishwasher")!, "laminate-walnut");
    expect(dw.some((p) => p.kind === "box" && p.material === "finish:laminate-walnut")).toBe(true);
    const fridge = applianceParts(catalogue.appliances.find((a) => a.id === "fridge")!, "matte-sage");
    expect(fridge).toEqual([expect.objectContaining({ kind: "outline", label: "Refrigerator space" })]);
  });
});

describe("roomModel", () => {
  const room = emptyMehta.room;
  const window = room.features.find((f) => f.kind === "window")!;
  const door = room.features.find((f) => f.kind === "door")!;
  const opening = (wallId: string, along: [number, number], z: [number, number]) => wallBoxToWorld(wallFrame(room, wallId), { along, depth: [-100, 0], z });

  it("full height: walls reach the ceiling with real holes for the window and door", () => {
    const m = roomModel(room, "full");
    expect(Math.max(...m.walls.map((w) => w.box.maxZ))).toBe(2850);
    const hole = opening("A", [1300, 2200], [1050, 2100]);
    expect(m.walls.some((w) => boxesIntersect(w.box, hole))).toBe(false);
    const doorHole = opening("H", [400, 1200], [0, 2100]);
    expect(m.walls.some((w) => boxesIntersect(w.box, doorHole))).toBe(false);
    // Wall A: solid below the sill and above the window head, either side of it.
    const a = m.walls.filter((w) => w.wallId === "A");
    const solid = a.reduce((s, w) => s + volume(w.box), 0);
    const ext = a.reduce((max, w) => Math.max(max, w.box.maxX), 0);
    expect(solid).toBe((ext - 0) * 100 * 2850 - 900 * 100 * 1050);
    expect(window.kind === "window" && door.kind === "door").toBe(true);
  });

  it("window gets a frame and a translucent pane", () => {
    const m = roomModel(room, "full");
    expect(m.parts.filter((p) => p.key.startsWith("f-window-frame"))).toHaveLength(4);
    expect(m.parts.find((p) => p.key === "f-window-pane")).toMatchObject({ material: "pane", wallId: "A" });
  });

  it("cut at 450: walls stop at 450, the door still leaves a gap, the window is above the cut", () => {
    const m = roomModel(room, "cut");
    expect(m.height).toBe(CUT_HEIGHT_MM);
    expect(Math.max(...m.walls.map((w) => w.box.maxZ))).toBe(450);
    expect(m.walls.some((w) => boxesIntersect(w.box, opening("H", [400, 1200], [0, 450])))).toBe(false);
    expect(m.parts.some((p) => p.key.startsWith("f-window"))).toBe(false);
    // Column and beam keep their real heights; the duct box is cut with the walls.
    expect(m.parts.find((p) => p.key === "f-column")!.box.maxZ).toBe(2850);
    expect(m.parts.find((p) => p.key === "f-beam")!.box.minZ).toBe(2400);
    expect(m.parts.find((p) => p.key === "f-duct")!.box.maxZ).toBe(450);
  });

  it("corners are solid and wall boxes never overlap", () => {
    const m = roomModel(room, "full");
    for (let i = 0; i < m.walls.length; i++) {
      for (let j = i + 1; j < m.walls.length; j++) expect(boxesIntersect(m.walls[i].box, m.walls[j].box)).toBe(false);
    }
    // Outer corner of A/B at (3300, -100).
    const corner = { minX: 3210, maxX: 3290, minY: -90, maxY: -10, minZ: 10, maxZ: 20 };
    expect(m.walls.some((w) => boxesIntersect(w.box, corner))).toBe(true);
  });

  it("duct box fills the notch between the notch walls' outer faces", () => {
    const duct = roomModel(room, "full").parts.find((p) => p.key === "f-duct")!.box;
    expect(duct).toMatchObject({ minX: 1100, maxX: 1500, minY: 2050, maxY: 2500 });
  });
});

describe("countertopModel", () => {
  it("slabs carry the sink and hob cut-outs as holes", () => {
    const slabs = countertopModel(sampleDesign, catalogue);
    expect(slabs.flatMap((s) => s.holes)).toHaveLength(2);
  });
});
