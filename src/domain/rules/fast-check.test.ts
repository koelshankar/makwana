import { describe, expect, it } from "vitest";
import { catalogue } from "../catalogue";
import { emptyMehta, sampleDesign } from "../seed";
import { unit } from "../testing";
import type { Layer, ModulePlacement, Project } from "../types";
import { nearestFreeOffset } from "../turn";
import { checkCandidate, checkPlacementFast, hasBlocked } from "./index";

/** Product choices that are always valid, so only placement rules can block. */
function candidate(code: string, wallId: string, offsetMm: number, layer: Layer): ModulePlacement {
  const width = catalogue.modules.find((m) => m.code === code)!.widthMm;
  const extra: Partial<ModulePlacement> = code === "T600OM" ? { shutterTypeId: "appliance-housing" } : {};
  if (code === "BC1000") extra.blindSide = "right";
  return unit("cand", code, wallId, offsetMm, width, layer, extra);
}

const partial: Project = {
  ...emptyMehta,
  modules: sampleDesign.modules.filter((m) => ["m-corner", "m-bd1", "m-la1", "m-wb1"].includes(m.id)),
};

describe("checkPlacementFast", () => {
  const cases: [Project, string, string, Layer][] = [
    [partial, "B600", "A", "base"],
    [partial, "T600OM", "A", "tall"],
    [partial, "W900", "A", "wall"],
    [partial, "L600", "B", "loft"],
    [partial, "LS900", "B", "loft"],
    [partial, "BC1000", "B", "base"],
    [sampleDesign, "B450", "B", "base"],
    [sampleDesign, "W600", "A", "wall"],
    [emptyMehta, "TP600", "H", "tall"],
  ];

  it("agrees with checkCandidate on blocked/not blocked across each wall", () => {
    let blocked = 0;
    let passed = 0;
    for (const [project, code, wallId, layer] of cases) {
      const len = project.room.walls.find((w) => w.id === wallId)!.lengthMm;
      for (let offset = -200; offset <= len; offset += 250) {
        const c = candidate(code, wallId, offset, layer);
        const fast = checkPlacementFast(project, catalogue, c);
        const full = hasBlocked(checkCandidate(project, catalogue, c));
        expect(fast.status === "blocked", `${code} on ${wallId} @${offset}`).toBe(full);
        if (full) blocked++;
        else passed++;
      }
    }
    // The sweep must exercise both outcomes.
    expect(blocked).toBeGreaterThan(10);
    expect(passed).toBeGreaterThan(10);
  });

  it("gives a one-line reason and no fixes", () => {
    const fast = checkPlacementFast(emptyMehta, catalogue, candidate("T600OM", "A", 1300, "tall"));
    expect(fast).toEqual({ status: "blocked", reason: "Tall unit cannot be placed over a window.", ruleId: "covers-window" });
    expect(checkPlacementFast(emptyMehta, catalogue, candidate("T600OM", "A", 600, "tall"))).toEqual({
      status: "pass",
      reason: null,
      ruleId: null,
    });
  });

  it("finds the nearest free offset on a wall", () => {
    const b600 = candidate("B600", "A", 100, "base");
    // Wall A starts with the 300 mm column.
    expect(nearestFreeOffset(emptyMehta, catalogue, b600, "A", 100)).toBe(300);
    // Wall B starts behind the BC1000 on wall A.
    const corner: Project = { ...emptyMehta, modules: [{ ...candidate("BC1000", "A", 2200, "base"), id: "corner" }] };
    expect(nearestFreeOffset(corner, catalogue, { ...b600, offsetMm: 0 }, "B", 0)).toBe(560);
    // Too long for wall E (600 mm).
    expect(nearestFreeOffset(emptyMehta, catalogue, candidate("B900", "E", 0, "base"), "E", 0)).toBeNull();
  });
});
