import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";
import { checkCandidate, hasBlocked } from "./rules";
import { emptyMehta, sampleDesign } from "./seed";
import { unit } from "./testing";
import { nearestFreeLabel, nearestFreeOffset, nextWall, turnedTo, turnSubject, wallsUnitFits, withNearestFreeFix } from "./turn";
import type { Project } from "./types";

const withUnits = (...modules: ReturnType<typeof unit>[]): Project => ({ ...emptyMehta, modules });

describe("which wall is next", () => {
  const b600 = unit("u", "B600", "A", 2600, 600);
  const b900 = unit("u", "B900", "C", 300, 900);
  const p = withUnits(b600);

  it("next and previous in A→H order, wrapping round", () => {
    expect(nextWall(p, catalogue, b600, "A", 1)).toBe("B");
    expect(nextWall(p, catalogue, b600, "A", -1)).toBe("H");
    expect(nextWall(p, catalogue, b600, "H", 1)).toBe("A");
  });

  it("skips walls too short for the unit (the 450 and 600 mm duct walls for a 900), and G, where the door takes the only spot", () => {
    // G is 1000 mm, but a 900 at G 0 or 100 runs in front of the door on H (400–1200 mm from the corner).
    expect(wallsUnitFits(p, catalogue, b900)).toEqual(["A", "B", "C", "H"]);
    expect(nextWall(p, catalogue, b900, "C", 1)).toBe("H");
    expect(nextWall(p, catalogue, b900, "H", -1)).toBe("C");
  });

  it("skips open segments", () => {
    const gapB = { ...p, room: { ...p.room, walls: p.room.walls.map((w) => (w.id === "B" ? { ...w, open: true as const } : w)) } };
    expect(nextWall(gapB, catalogue, b600, "A", 1)).toBe("C");
  });

  it("no other wall fits: null", () => {
    const wide = unit("u", "B600", "A", 0, 3200, "base", { isCustomSize: true });
    expect(wallsUnitFits(p, catalogue, wide)).toEqual(["A"]);
    expect(nextWall(p, catalogue, wide, "A", 1)).toBeNull();
  });
});

describe("wallsUnitFits: the one fit check for Move, the Wall picker and R (Feedback 2, item 3)", () => {
  const b600 = unit("u", "B600", "A", 2600, 600);

  it("a wall long enough but with no free spot in the unit's band isn't offered; the band matters", () => {
    // C (1600) has 1500 mm of base units: 100 mm left, too little for a 600.
    const full = withUnits(b600, unit("c1", "B900", "C", 0, 900), unit("c2", "B600", "C", 900, 600));
    expect(wallsUnitFits(full, catalogue, b600)).not.toContain("C");
    expect(nextWall(full, catalogue, b600, "B", 1)).not.toBe("C");
    // A wall unit uses another height band: C is still free for it.
    expect(wallsUnitFits(full, catalogue, unit("w", "W600", "A", 1000, 600, "wall"))).toContain("C");
  });

  it("a gap exactly as wide as the unit counts, even off the 10 mm steps", () => {
    const gap = withUnits(b600, unit("c1", "B600", "C", 0, 605, "base", { isCustomSize: true }), unit("c2", "B600", "C", 1205, 395, "base", { isCustomSize: true }));
    expect(wallsUnitFits(gap, catalogue, b600)).toContain("C");
    expect(nearestFreeOffset(gap, catalogue, b600, "C", 0)).toBe(605);
  });

  it("its own wall always counts; open segments never do", () => {
    const gapB = { ...emptyMehta, modules: [b600], room: { ...emptyMehta.room, walls: emptyMehta.room.walls.map((w) => (w.id === "B" ? { ...w, open: true as const } : w)) } };
    // Not B (open), D or F (450 mm), or G (the door on H takes its only spot for a base unit).
    expect(wallsUnitFits(gapB, catalogue, b600)).toEqual(["A", "C", "E", "H"]);
  });
});

describe("where a turned unit goes", () => {
  it("next to the A/B corner on A, it lands in the same corner on B", () => {
    const b600 = unit("u", "B600", "A", 2600, 600);
    expect(turnedTo(withUnits(b600), catalogue, b600, "B")).toMatchObject({ wallId: "B", offsetMm: 0, layer: "base" });
  });

  it("projects the footprint centre: a unit mid-wall on A goes to the A end of H, kept on the wall", () => {
    const b600 = unit("u", "B600", "A", 2600, 600);
    // Centre (2900, 280) is 280 mm from A along H's line: H's A end is its right end (1800–2400).
    expect(turnedTo(withUnits(b600), catalogue, b600, "H")).toMatchObject({ wallId: "H", offsetMm: 1800 });
  });

  it("only moves along the wall: layer, width, finish and id stay", () => {
    const w600 = unit("w", "W600", "A", 1000, 600, "wall");
    const t = turnedTo(withUnits(w600), catalogue, w600, "C");
    expect(t).toEqual({ ...w600, wallId: "C", offsetMm: t.offsetMm });
  });

  it("a blind corner unit's blind side faces the nearer end of its new wall", () => {
    const bc = sampleDesign.modules.find((m) => m.moduleCode === "BC1000")!;
    expect(bc.blindSide).toBe("right");
    const t = turnedTo(sampleDesign, catalogue, bc, "B");
    expect(t).toMatchObject({ wallId: "B", offsetMm: 0, blindSide: "left" });
  });

  it("a fitted appliance turns its host; a free one turns itself", () => {
    expect(turnSubject(sampleDesign, "a-sink")?.id).toBe("m-sink");
    expect(turnSubject(sampleDesign, "a-chimney")?.id).toBe("a-chimney");
    expect(turnSubject(sampleDesign, "nope")).toBeNull();
  });
});

describe("a blocked turn", () => {
  it("leads with 'Move to nearest free spot on Wall X', which clears the block", () => {
    // Into the A/H corner of H, where the column stands.
    const b600 = unit("u", "B600", "A", 2600, 600);
    const project = withUnits(b600);
    const turned = turnedTo(project, catalogue, b600, "H");
    const raw = checkCandidate(project, catalogue, turned);
    expect(hasBlocked(raw)).toBe(true);
    const results = withNearestFreeFix(project, catalogue, turned, raw);
    for (const r of results.filter((x) => x.status === "blocked")) {
      expect(r.fixes[0].label).toBe(nearestFreeLabel("H"));
      expect(r.fixes.filter((f) => f.label === nearestFreeLabel("H"))).toHaveLength(1);
    }
    const fix = results.find((r) => r.status === "blocked")!.fixes[0].action;
    // Clear of the column (H 2100–2400) and the door (H 400–1200): 1500–2100.
    expect(fix).toEqual({ type: "move", placementId: "u", wallId: "H", offsetMm: 1500 });
    expect(hasBlocked(checkCandidate(project, catalogue, { ...turned, offsetMm: 1500 }))).toBe(false);
  });
});
