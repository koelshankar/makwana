// Inside-corner rules (Feedback 2, item 4): a) a front hidden behind a neighbour's side, b) handles
// clashing where two fronts meet. On the Mehta room, the A/B corner is at A's far end (offset 3200)
// and at B's start (offset 0).

import { describe, expect, it } from "vitest";
import { catalogue } from "../catalogue";
import { applyFix } from "../fixes";
import { quoteModel } from "../quote";
import { emptyMehta, sampleDesign } from "../seed";
import { expectFixesWork, unit } from "../testing";
import type { CheckResult, ModulePlacement, Project } from "../types";
import { bandsClash, cornerClearance, CORNER_CLEARANCE_MM } from "./corner";
import { checkCandidate, checkPlacementFast, runAllChecks } from "./index";

const project = (...modules: ModulePlacement[]): Project => ({ ...emptyMehta, modules, appliances: [] });
const corner = (p: Project): CheckResult[] =>
  runAllChecks(p, catalogue).filter((r) => r.status !== "pass" && (r.ruleId === "corner" || r.ruleId === "corner-clash"));
const others = (p: Project) => runAllChecks(p, catalogue).filter((r) => r.status !== "pass" && r.ruleId !== "corner" && r.ruleId !== "corner-clash");

const BC = (offsetMm = 2200) => unit("bc", "BC1000", "A", offsetMm, 1000, "base", { blindSide: "right" });
const T600 = (id: string, wallId: string, offsetMm: number) =>
  unit(id, "T600OM", wallId, offsetMm, 600, "tall", { finishId: "laminate-charcoal", shutterTypeId: "appliance-housing" });

describe("height bands", () => {
  it("same layer meets, tall meets everything, base and wall units don't, lofts only meet lofts and tall", () => {
    expect(bandsClash("base", "base")).toBe(true);
    expect(bandsClash("tall", "base")).toBe(true);
    expect(bandsClash("tall", "wall")).toBe(true);
    expect(bandsClash("tall", "loft")).toBe(true);
    expect(bandsClash("wall", "base")).toBe(false);
    expect(bandsClash("loft", "wall")).toBe(false);
    expect(bandsClash("loft", "loft")).toBe(true);
  });

  it("a base unit next to a wall unit at a corner: nothing to report", () => {
    expect(corner(project(unit("w", "W600", "A", 2600, 600, "wall"), unit("b", "B600", "B", 350, 600)))).toEqual([]);
    expect(corner(project(unit("b", "B600", "A", 2600, 600), unit("w", "W600", "B", 560, 600, "wall")))).toEqual([]);
  });

  it("a loft next to a wall unit doesn't clash; two lofts do", () => {
    expect(corner(project(unit("l", "L600", "A", 2600, 600, "loft"), unit("w", "W600", "B", 350, 600, "wall")))).toEqual([]);
    const [r] = corner(project(unit("l1", "L600", "A", 2600, 600, "loft"), unit("l2", "L600", "B", 350, 600, "loft")));
    expect(r).toMatchObject({ ruleId: "corner", status: "blocked", placementIds: ["l1", "l2"] });
  });
});

describe("a) hidden front", () => {
  it("blocks wall units whose front is behind the other wall unit's side, and moves it clear", () => {
    const p = project(unit("wa", "W600", "A", 2600, 600, "wall"), unit("wb", "W900", "B", 350, 900, "wall"));
    const [r, ...rest] = corner(p);
    expect(rest).toEqual([]);
    expect(r).toMatchObject({ ruleId: "corner", status: "blocked", placementIds: ["wa", "wb"] });
    expect(r.message).toBe(
      "W600's front is behind the side of W900 at the corner of Wall A and Wall B. 350 mm of it can't open: move W600 along Wall A until its front is clear.",
    );
    // Clear of W900's side (350) and its handles (50): the window ends at 2200, which is just right.
    expect(r.fixes).toEqual([{ label: "Move clear of corner", action: { type: "move", placementId: "wa", wallId: "A", offsetMm: 2200 } }]);
    expectFixesWork(p, [r]);
    expect(corner(applyFix(p, catalogue, r.fixes[0].action))).toEqual([]);
  });

  it("blocks a base unit, or a wall unit, standing in front of a tall unit's doors", () => {
    // T600OM in the corner on B; its doors open towards wall A's run.
    const [hit] = corner(project(T600("t", "B", 0), unit("b", "B600", "A", 2040, 600)));
    expect(hit).toMatchObject({ ruleId: "corner", status: "blocked", placementIds: ["t", "b"] });
    expect(hit.message).toMatch(/^T600OM's front is behind the side of B600 at the corner of Wall A and Wall B\. 560 mm/);
    const [wall] = corner(project(T600("t", "B", 0), unit("w", "W600", "A", 2040, 600, "wall")));
    expect(wall).toMatchObject({ ruleId: "corner", status: "blocked", placementIds: ["t", "w"] });
    expect(wall.message).toMatch(/350 mm of it can't open/);
    // A unit's depth away (560 mm from the tall unit's front) leaves room to open.
    expect(corner(project(T600("t", "B", 0), unit("b", "B600", "A", 1480, 600)))).toEqual([]);
  });

  it("says why when there is no spot that clears the corner, and shows no move button", () => {
    // The tall unit would have to start 610 mm along B, and B is full from 600.
    const p = project(T600("t", "B", 0), unit("b", "B600", "A", 2040, 600), unit("b1", "B900", "B", 600, 900), unit("b2", "B900", "B", 1500, 900));
    const r = corner(p).find((x) => x.ruleId === "corner")!;
    expect(r.placementIds).toEqual(["t", "b"]);
    expect(r.fixes).toEqual([]);
    expect(r.message).toMatch(/There is no free spot on Wall B where its front is clear\.$/);
  });

  it("one message per hidden unit: a plain base corner reports only the hidden front, not a clash or a gap", () => {
    const p = project(unit("a", "B600", "A", 2600, 600), unit("b", "B600", "B", 560, 600));
    expect(corner(p).map((r) => [r.ruleId, r.placementIds])).toEqual([["corner", ["a", "b"]]]);
    expect(others(p)).toEqual([]);
  });

  it("is refused when placed, and the fast check agrees", () => {
    const p = project(unit("b", "B600", "B", 560, 600));
    const candidate = unit("a", "B600", "A", 2600, 600);
    expect(checkCandidate(p, catalogue, candidate).some((r) => r.ruleId === "corner" && r.status === "blocked")).toBe(true);
    expect(checkPlacementFast(p, catalogue, candidate)).toMatchObject({ status: "blocked", ruleId: "corner" });
    expect(checkPlacementFast(p, catalogue, { ...candidate, offsetMm: 1990 })).toMatchObject({ status: "pass" });
  });
});

describe("b) handle clash", () => {
  it("warns for a BC1000 with a drawer unit butting its front, and adds a corner filler", () => {
    const p = project(BC(), unit("bd", "BD600", "B", 560, 600));
    const [r, ...rest] = corner(p);
    expect(rest).toEqual([]);
    expect(r).toMatchObject({ ruleId: "corner-clash", status: "warning", placementIds: ["bc", "bd"] });
    expect(r.message).toBe(
      "Handles clash where BC1000 and BD600 meet at the corner of Wall A and Wall B. The fronts need 50 mm between them: add a corner filler.",
    );
    // The blind corner unit is pulled 50 mm out of the corner; the filler goes in behind it.
    expect(r.fixes).toEqual([
      { label: "Add corner filler", action: { type: "addCornerFiller", placementId: "bc", offsetMm: 2150, fillerOffsetMm: 3150, widthMm: 50 } },
    ]);
    expectFixesWork(p, [r]);
    const after = applyFix(p, catalogue, r.fixes[0].action);
    expect(after.modules.map((m) => `${m.moduleCode}@${m.wallId}${m.offsetMm}+${m.widthMm}`)).toEqual(["BC1000@A2150+1000", "BD600@B560+600", "FIL@A3150+50"]);
    expect(corner(after)).toEqual([]);
  });

  it("passes once the second front starts the clearance past the first", () => {
    expect(corner(project(BC(), unit("bd", "BD600", "B", 610, 600)))).toEqual([]);
    expect(corner(project(BC(2150), unit("bd", "BD600", "B", 560, 600)))).toEqual([]);
  });

  it("moves the other unit when the corner unit can't move, pushing the run along", () => {
    // Wall A is full from the column to the corner, so BC1000 can't be pulled out; on B the two drawer
    // units move 50 mm along together.
    const p = project(
      unit("a1", "B900", "A", 300, 900),
      unit("a2", "B900", "A", 1200, 900),
      unit("fa", "FIL", "A", 2100, 100),
      BC(),
      unit("b1", "BD600", "B", 560, 600),
      unit("b2", "BD600", "B", 1160, 600),
    );
    const [r] = corner(p);
    expect(r.fixes).toEqual([
      { label: "Add corner filler", action: { type: "addCornerFiller", placementId: "b1", offsetMm: 610, fillerOffsetMm: 560, widthMm: 50 } },
    ]);
    const after = applyFix(p, catalogue, r.fixes[0].action);
    expect(after.modules.filter((m) => m.wallId === "B").map((m) => `${m.moduleCode}@${m.offsetMm}+${m.widthMm}`)).toEqual(["BD600@610+600", "BD600@1210+600", "FIL@560+50"]);
  });

  it("says why when neither wall has room, with no filler button (the old sample design)", () => {
    const old = {
      ...sampleDesign,
      modules: sampleDesign.modules
        .filter((m) => m.id !== "m-fil-corner")
        .map((m) => (m.id === "m-corner" ? { ...m, offsetMm: 2200 } : m.id === "m-fil-a" ? { ...m, widthMm: 100 } : m.id === "m-wa1" ? { ...m, offsetMm: 2600 } : m)),
    };
    const clash = corner(old).find((r) => r.ruleId === "corner-clash")!;
    expect(clash.fixes).toEqual([]);
    expect(clash.message).toMatch(/Neither Wall A nor Wall B has room to move a unit 50 mm along\.$/);
    // And W600 behind W900's side: blocked, moved clear to 2200, which is where the sample now has it.
    const hidden = corner(old).find((r) => r.ruleId === "corner")!;
    expect(hidden.fixes[0].action).toEqual({ type: "move", placementId: "m-wa1", wallId: "A", offsetMm: 2200 });
  });

  it("blocks when either unit is tall; the drop is refused, the fast check agrees, and the filler fix places it", () => {
    const p = project(BC());
    const t = T600("t", "B", 560);
    const results = checkCandidate(p, catalogue, t);
    const r = results.find((x) => x.ruleId === "corner-clash")!;
    expect(r.status).toBe("blocked");
    expect(checkPlacementFast(p, catalogue, t)).toMatchObject({ status: "blocked", ruleId: "corner-clash" });
    expect(r.fixes.map((f) => f.label)).toEqual(["Add corner filler"]);
    const after = applyFix({ ...p, modules: [...p.modules, t] }, catalogue, r.fixes[0].action);
    expect(runAllChecks(after, catalogue).filter((x) => x.status === "blocked")).toEqual([]);
  });

  it("leaves a short gap at a clash to the clash rule: no 20 mm filler that would leave the handles clashing", () => {
    const p = project(BC(), unit("bd", "BD600", "B", 580, 600));
    expect(runAllChecks(p, catalogue).filter((r) => r.status !== "pass").map((r) => r.ruleId)).toEqual(["corner-clash"]);
    const [r] = corner(p);
    // The filler goes on B, from BC1000's front (560), and covers the 20 mm gap; BD600 moves 30 mm to 610.
    expect(r.fixes[0].action).toEqual({ type: "addCornerFiller", placementId: "bd", offsetMm: 610, fillerOffsetMm: 560, widthMm: 50 });
    expect(runAllChecks(applyFix(p, catalogue, r.fixes[0].action), catalogue).filter((x) => x.status !== "pass")).toEqual([]);
  });

  it("the corner filler is a FIL line in the quote, priced like any filler", () => {
    const p = project(BC(), unit("bd", "BD600", "B", 560, 600));
    const after = applyFix(p, catalogue, corner(p)[0].fixes[0].action);
    const base = quoteModel(after, catalogue).groups.find((g) => g.group === "base")!;
    const filler = base.lines.find((l) => l.code === "FIL")!;
    expect(filler).toMatchObject({ wall: "Wall A", size: { w: 50 } });
    expect(filler.amount).toBeGreaterThan(0);
  });
});

describe("clearance", () => {
  it("is one constant per handle type, 50 mm each until Makwana confirms", () => {
    expect(CORNER_CLEARANCE_MM).toEqual({ handle: 50, handleless: 50 });
    expect(cornerClearance("standard")).toBe(CORNER_CLEARANCE_MM.handle);
    expect(cornerClearance("handleless")).toBe(CORNER_CLEARANCE_MM.handleless);
  });
});

describe("the sample design", () => {
  it("is clean at every corner", () => {
    expect(corner(sampleDesign)).toEqual([]);
  });
});
