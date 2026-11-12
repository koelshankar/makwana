import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";
import { emptyMehta, sampleDesign } from "./seed";
import { neighbourGaps, snapOffset, snapTargets, type SnapTargets } from "./snapping";

const targets: SnapTargets = {
  lengthMm: 3200,
  occupied: [
    [0, 300],
    [1000, 1600],
  ],
  neighbours: [[1000, 1600]],
  runEnds: [[0, 300]],
  features: [1300, 2200],
};

describe("snapOffset", () => {
  it("prefers neighbour edges over run ends and features", () => {
    // Right edge 4 mm short of the neighbour's left edge, left edge 4 mm off the 300 run end.
    expect(snapOffset(304, 692, targets, 20)).toEqual({ offsetMm: 308, kind: "neighbour" });
  });

  it("snaps to run ends, then feature edges, within the threshold", () => {
    expect(snapOffset(312, 600, targets, 20)).toEqual({ offsetMm: 300, kind: "runEnd" });
    expect(snapOffset(2590, 600, targets, 20)).toEqual({ offsetMm: 2600, kind: "runEnd" }); // wall end
    expect(snapOffset(2188, 450, targets, 20)).toEqual({ offsetMm: 2200, kind: "feature" });
  });

  it("prefers a free wall end over a neighbour edge when both are in reach (M1)", () => {
    // Wall A at 1366 px: SU900 at 1200-2100, BC1000 (1000 wide) dropped 20 mm short of the end; 8 px = 87 mm.
    const a: SnapTargets = { lengthMm: 3200, occupied: [[0, 300], [300, 1200], [1200, 2100]], neighbours: [[300, 1200], [1200, 2100]], runEnds: [[0, 300]], features: [1300, 2200, 1750] };
    expect(snapOffset(2180, 1000, a, 87)).toEqual({ offsetMm: 2200, kind: "runEnd" });
    expect(snapOffset(2120, 1000, a, 87)).toEqual({ offsetMm: 2200, kind: "runEnd" });
    // Out of the wall end's reach, the neighbour still wins.
    expect(snapOffset(2105, 1000, a, 87)).toEqual({ offsetMm: 2100, kind: "neighbour" });
  });

  it("skips a wall end that is occupied (the column in the corner)", () => {
    expect(snapOffset(12, 600, targets, 20)).toEqual({ offsetMm: 10, kind: "grid" });
    expect(snapOffset(312, 600, targets, 20)).toEqual({ offsetMm: 300, kind: "runEnd" });
  });

  it("falls back to the 10 mm grid, or when magnets are off", () => {
    expect(snapOffset(2004, 450, targets, 20)).toEqual({ offsetMm: 2000, kind: "grid" });
    expect(snapOffset(312, 600, targets, 20, false)).toEqual({ offsetMm: 310, kind: "grid" });
  });
});

describe("snapTargets and neighbourGaps", () => {
  it("treats the adjacent wall's corner unit and the column as run ends", () => {
    const b = snapTargets(sampleDesign, catalogue, "B", "base", "m-bd1");
    expect(b.runEnds).toContainEqual([0, 560]); // BC1000 on wall A
    expect(b.neighbours).toContainEqual([1160, 1760]);
    const a = snapTargets(emptyMehta, catalogue, "A", "base");
    expect(a.runEnds).toEqual([[0, 300]]);
    expect(a.features).toEqual([1300, 2200, 1750]);
  });

  it("measures clear distances on each side", () => {
    expect(neighbourGaps(400, 500, targets)).toEqual({ left: 100, right: 100 });
    expect(neighbourGaps(1700, 900, targets)).toEqual({ left: 100, right: 600 });
    expect(neighbourGaps(1500, 300, targets)).toEqual({ left: null, right: 1400 });
  });
});
