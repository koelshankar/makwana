import { describe, expect, it } from "vitest";
import { catalogue } from "../catalogue";
import { withPlacement } from "../fixes";
import { emptyMehta, sampleDesign } from "../seed";
import { expectFixesWork, unit } from "../testing";
import type { AppliancePlacement, CheckResult, Feature, ModulePlacement, Project } from "../types";
import { checkCandidate, runAllChecks, summarise } from "./index";

const project = (modules: ModulePlacement[], appliances: AppliancePlacement[] = [], base: Project = emptyMehta): Project => ({
  ...base,
  modules,
  appliances,
});

const issues = (p: Project, ruleId?: string) =>
  runAllChecks(p, catalogue).filter((r) => r.status !== "pass" && (!ruleId || r.ruleId === ruleId));

/** Runs checks, asserts every returned fix works, and returns the non-pass results. */
function check(p: Project, ruleId?: string): CheckResult[] {
  const found = issues(p, ruleId);
  expectFixesWork(p, found);
  return found;
}

describe("sampleDesign", () => {
  it("passes every check with no blocked, warning or approval results", () => {
    const results = runAllChecks(sampleDesign, catalogue);
    expect(results.filter((r) => r.status !== "pass")).toEqual([]);
    expect(summarise(results)).toEqual({ blocked: 0, warning: 0, approval: 0 });
  });

  it("has about a dozen modules, five appliances and a BC1000 at the A/B corner", () => {
    expect(sampleDesign.modules.length).toBeGreaterThanOrEqual(12);
    expect(sampleDesign.appliances).toHaveLength(5);
    expect(sampleDesign.modules.find((m) => m.moduleCode === "BC1000")).toMatchObject({ wallId: "A", offsetMm: 2200 });
  });
});

describe("room rules", () => {
  it("blocks a T600OM over the window on wall A, with a working fix", () => {
    const t600 = unit("t600", "T600OM", "A", 1300, 600, "tall", {
      finishId: "laminate-charcoal",
      shutterTypeId: "appliance-housing",
    });
    const results = checkCandidate(emptyMehta, catalogue, t600);
    const blocked = results.find((r) => r.ruleId === "covers-window");
    expect(blocked?.status).toBe("blocked");
    expect(blocked?.message).toBe(
      "Tall unit cannot be placed over a window. T600OM is 2100 mm tall and would cover the window on Wall A (1300–2200 mm from the corner).",
    );
    expect(blocked!.fixes.length).toBeGreaterThanOrEqual(1);
    // Nearest clear spot on wall A (left of the window), then the next wall.
    expect(blocked!.fixes.map((f) => f.action)).toEqual([
      { type: "move", placementId: "t600", wallId: "A", offsetMm: 700 },
      { type: "move", placementId: "t600", wallId: "B", offsetMm: 0 },
    ]);
    expectFixesWork(withPlacement(emptyMehta, t600), results);
  });

  it("refuses the same T600OM as a candidate on the full sample design", () => {
    const t600 = unit("t600", "T600OM", "A", 1300, 600, "tall", { shutterTypeId: "appliance-housing" });
    const results = checkCandidate(sampleDesign, catalogue, t600);
    expect(results.some((r) => r.status === "blocked")).toBe(true);
    expectFixesWork(withPlacement(sampleDesign, t600), results);
  });

  it("blocks a loft over the beam and offers the same-width short loft", () => {
    const [r] = check(project([unit("l", "L600", "B", 600, 600, "loft", { finishId: "acrylic-ivory" })]), "beam");
    expect(r.status).toBe("blocked");
    expect(r.fixes.map((f) => f.action)).toContainEqual({ type: "replace", placementId: "l", moduleCode: "LS600" });
  });

  it("blocks units above the ceiling", () => {
    const low = { ...emptyMehta, room: { ...emptyMehta.room, ceilingHeightMm: 2400 } };
    const [r] = check(project([unit("l", "L600", "A", 300, 600, "loft", { finishId: "acrylic-ivory" })], [], low), "above-ceiling");
    expect(r.status).toBe("blocked");
    expect(r.fixes[0].action).toEqual({ type: "replace", placementId: "l", moduleCode: "LS600" });
  });

  it("blocks a unit in front of the door, with a move fix", () => {
    const [r] = check(project([unit("b", "B600", "H", 600, 600)]), "blocks-door");
    expect(r.status).toBe("blocked");
    expect(r.fixes.length).toBeGreaterThan(0);
  });

  it("blocks a unit running into the column", () => {
    const [r] = check(project([unit("b", "B600", "A", 0, 600)]), "column");
    expect(r.status).toBe("blocked");
    expect(r.fixes[0].action).toEqual({ type: "move", placementId: "b", wallId: "A", offsetMm: 300 });
  });

  it("blocks a unit past the end of its wall", () => {
    const [r] = check(project([unit("b", "B600", "B", 1900, 600)]), "outside-wall");
    expect(r.message).toBe("B600 runs 100 mm past the end of Wall B.");
    expect(r.fixes[0].action).toEqual({ type: "move", placementId: "b", wallId: "B", offsetMm: 1800 });
  });

  it("blocks an open room", () => {
    const open = { ...emptyMehta, room: { ...emptyMehta.room, walls: emptyMehta.room.walls.slice(0, 7) } };
    expect(issues(open, "room-closed")[0].status).toBe("blocked");
  });
});

describe("fit rules", () => {
  it("blocks a unit overlapping the blind corner across the A/B corner", () => {
    const p = project([unit("bc", "BC1000", "A", 2200, 1000), unit("b6", "B600", "B", 0, 600)]);
    const [r] = check(p, "overlap");
    expect(r.status).toBe("blocked");
    expect(r.placementIds).toEqual(["bc", "b6"]);
    expect(r.fixes[0].action).toEqual({ type: "move", placementId: "b6", wallId: "B", offsetMm: 560 });
  });

  it("warns about a 62 mm gap at the end of wall B, with a 62 mm filler fix", () => {
    const p = project([
      unit("f", "FIL", "B", 0, 88),
      unit("b1", "B900", "B", 88, 900),
      unit("b2", "B900", "B", 988, 900),
      unit("b3", "B450", "B", 1888, 450),
    ]);
    const gaps = check(p, "leftover-gap");
    expect(gaps).toHaveLength(1);
    expect(gaps[0].status).toBe("warning");
    expect(gaps[0].message).toBe("62 mm gap at the end of Wall B.");
    expect(gaps[0].fixes[0].action).toEqual({ type: "addFiller", wallId: "B", layer: "base", offsetMm: 2338, widthMm: 62 });
  });

  it("offers a wider catalogue unit when it fills a gap exactly", () => {
    // B600 at 300 on wall A, then B600 at 1050 → a 150 mm gap a B750 fills exactly.
    const p = project([unit("b1", "B600", "A", 300, 600), unit("b2", "B600", "A", 1050, 600)]);
    const [r] = check(p, "leftover-gap");
    expect(r.message).toBe("150 mm gap between B600 and B600 on Wall A.");
    // Either neighbour grows into the gap; sliding b1 right would just open a gap by the column.
    expect(r.fixes.map((f) => f.action)).toEqual([
      { type: "replaceAndMove", placementId: "b1", moduleCode: "B750", offsetMm: 300 },
      { type: "replaceAndMove", placementId: "b2", moduleCode: "B750", offsetMm: 900 },
      { type: "move", placementId: "b2", wallId: "A", offsetMm: 900 },
    ]);
  });

  it("warns when an inside corner has base units on both walls but no blind corner", () => {
    const p = project([unit("a", "B600", "A", 2600, 600), unit("b", "B600", "B", 600, 600)]);
    const [r] = check(p, "corner");
    expect(r.status).toBe("warning");
    // Only the wall A unit can become a BC1000 tucked into the corner; on wall B it would hit wall A's unit.
    expect(r.fixes.map((f) => f.action)).toEqual([
      { type: "replaceAndMove", placementId: "a", moduleCode: "BC1000", offsetMm: 2200 },
    ]);
  });
});

describe("product and commercial rules", () => {
  it("blocks Acrylic + Handleless and offers a shutter type fix", () => {
    const p = project([unit("b", "B600", "A", 300, 600, "base", { finishId: "acrylic-ivory", shutterTypeId: "handleless" })]);
    const [r] = check(p, "finish-shutter");
    expect(r.status).toBe("blocked");
    expect(r.fixes[0].action).toEqual({ type: "setShutterType", placementId: "b", shutterTypeId: "standard" });
  });

  it("blocks glass frames on base units and T600OM without appliance housing", () => {
    const p = project([
      unit("b", "B600", "A", 300, 600, "base", { shutterTypeId: "glass" }),
      unit("t", "T600OM", "B", 1800, 600, "tall"),
    ]);
    const results = check(p, "finish-shutter");
    expect(results.map((r) => r.fixes[0].action)).toEqual([
      { type: "setShutterType", placementId: "b", shutterTypeId: "standard" },
      { type: "setShutterType", placementId: "t", shutterTypeId: "appliance-housing" },
    ]);
  });

  it("needs approval for an 8% discount but not 5%", () => {
    expect(issues({ ...sampleDesign, discountPct: 8 })).toEqual([
      expect.objectContaining({ ruleId: "discount", status: "approval" }),
    ]);
    expect(issues({ ...sampleDesign, discountPct: 5 })).toEqual([]);
  });

  it("needs approval for a custom size", () => {
    const p = project([unit("b", "B600", "A", 300, 640, "base", { isCustomSize: true })]);
    expect(issues(p, "custom-size")[0].status).toBe("approval");
  });
});

describe("appliance rules", () => {
  const sinkOn = (wallId: string, offsetMm: number, base: Project = emptyMehta) =>
    project([unit("su", "SU900", wallId, offsetMm, 900)], [{ kind: "hosted", id: "sink", applianceId: "sink", hostPlacementId: "su" }], base);

  it("blocks a sink 1500 mm from the plumbing point", () => {
    // Plumbing at 1750 on a 3200 wall can't be 1500 mm from any SU900 centre, so move it to 250.
    const features: Feature[] = emptyMehta.room.features.map((f) => (f.kind === "plumbing" ? { ...f, offsetMm: 250 } : f));
    const base = { ...emptyMehta, room: { ...emptyMehta.room, features } };
    const [r] = check(sinkOn("A", 1300, base), "sink-plumbing");
    expect(r.status).toBe("blocked");
    expect(r.message).toBe("The sink is 1500 mm from the plumbing point on Wall A. It must be within 600 mm.");
  });

  it("blocks a sink on a wall with no plumbing", () => {
    const [r] = check(sinkOn("B", 600), "sink-plumbing");
    expect(r.message).toBe("There is no plumbing point on Wall B for the sink.");
  });

  it("offers to move a sink unit over the plumbing point", () => {
    const [r] = check(sinkOn("A", 300), "sink-plumbing");
    expect(r.fixes[0].action).toEqual({ type: "move", placementId: "su", wallId: "A", offsetMm: 1300 });
  });

  it("blocks a hob on an HU900 under the window", () => {
    const p = project([unit("hu", "HU900", "A", 1300, 900)], [{ kind: "hosted", id: "hob", applianceId: "hob", hostPlacementId: "hu" }]);
    const [r] = check(p, "hob-window");
    expect(r.status).toBe("blocked");
    expect(r.fixes.length).toBeGreaterThan(0);
  });

  it("warns when the chimney is off-centre over the hob, and fixes it", () => {
    const p = {
      ...sampleDesign,
      appliances: sampleDesign.appliances.map((a) => (a.id === "a-chimney" && a.kind === "free" ? { ...a, offsetMm: 400 } : a)),
    };
    const [r] = check(p, "chimney-hob");
    expect(r.status).toBe("warning");
    expect(r.fixes[0].action).toEqual({ type: "move", placementId: "a-chimney", wallId: "A", offsetMm: 300 });
  });

  it("blocks an appliance fitted into the wrong host", () => {
    const p = project([unit("b", "B900", "A", 300, 900)], [{ kind: "hosted", id: "hob", applianceId: "hob", hostPlacementId: "b" }]);
    expect(check(p, "appliance-host")[0].status).toBe("blocked");
  });
});

describe("day 2 corrections", () => {
  it("uses the beam's depth: a loft on wall A reaching under wall B's beam is blocked", () => {
    const under = project([unit("l", "L600", "A", 2600, 600, "loft", { finishId: "acrylic-ivory" })]);
    expect(check(under, "beam")[0].status).toBe("blocked");
    // Ending 200 mm short of wall B clears a 200 mm deep beam.
    const clear = project([unit("l", "L600", "A", 2400, 600, "loft", { finishId: "acrylic-ivory" })]);
    expect(issues(clear, "beam")).toEqual([]);
  });

  it("blocks a BC1000 with no blind side, with a fix", () => {
    const p = project([unit("bc", "BC1000", "A", 2200, 1000)]);
    const [r] = check(p, "blind-side");
    expect(r.fixes[0].action).toEqual({ type: "setBlindSide", placementId: "bc", blindSide: "right" });
  });

  it("warns when a blind corner faces away from the corner, and flips it", () => {
    const p = project([
      unit("bc", "BC1000", "A", 2200, 1000, "base", { blindSide: "left" }),
      unit("b", "B600", "B", 560, 600),
    ]);
    const [r] = check(p, "corner");
    expect(r.message).toMatch(/blind side facing away/);
    expect(r.fixes[0].action).toEqual({ type: "setBlindSide", placementId: "bc", blindSide: "right" });
  });
});
