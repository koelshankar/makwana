import { describe, expect, it } from "vitest";
import { catalogue } from "../catalogue";
import { applyFix, withPlacement } from "../fixes";
import { priceProject } from "../pricing";
import { emptyMehta, sampleDesign } from "../seed";
import { expectFixesWork, unit } from "../testing";
import type { AppliancePlacement, FreeAppliancePlacement, HostedAppliancePlacement, ModulePlacement, Project } from "../types";
import { checkCandidate, checkPlacementFast, hasBlocked, isFixSafe, runAllChecks, runRawChecks } from "./index";

const project = (modules: ModulePlacement[], appliances: AppliancePlacement[] = [], base: Project = emptyMehta): Project => ({ ...base, modules, appliances });
const fitted = (id: string, applianceId: string, hostPlacementId: string): HostedAppliancePlacement => ({ kind: "hosted", id, applianceId, hostPlacementId });
const loose = (id: string, applianceId: string, wallId: string, offsetMm: number): FreeAppliancePlacement => ({
  kind: "free",
  id,
  applianceId,
  wallId,
  layer: catalogue.appliances.find((a) => a.id === applianceId)!.layer,
  offsetMm,
});

/** SU900 under the plumbing point and an HU900 clear of the window on Wall A. */
const kitchen = project([unit("su", "SU900", "A", 1200, 900), unit("hu", "HU900", "A", 300, 900)]);

describe("suppliedBy", () => {
  it("a customer's own appliance costs ₹0 but its cut-out is still charged", () => {
    const own = { ...sampleDesign, appliances: sampleDesign.appliances.map((a) => (a.id === "a-sink" ? { ...a, suppliedBy: "customer" as const } : a)) };
    const lines = priceProject(own, catalogue).lines.filter((l) => l.placementId === "a-sink");
    expect(lines.map((l) => [l.code, l.amount])).toEqual([
      ["sink", 0],
      ["sink-cutout", 1200],
    ]);
    expect(lines[0].description).toBe("Single-bowl sink (customer's own)");
  });

  it("switching the chimney to the customer's own drops the subtotal by its price only", () => {
    const own = { ...sampleDesign, appliances: sampleDesign.appliances.map((a) => (a.id === "a-chimney" ? { ...a, suppliedBy: "customer" as const } : a)) };
    expect(priceProject(sampleDesign, catalogue).subtotal - priceProject(own, catalogue).subtotal).toBe(32900);
  });
});

describe("anchors", () => {
  it("gaps are anchored to the gap itself", () => {
    const p = project([unit("a", "B600", "B", 560, 600), unit("b", "B600", "B", 1220, 600)]);
    const gap = runRawChecks(p, catalogue).find((r) => r.ruleId === "leftover-gap" && r.message.startsWith("60 mm"))!;
    expect(gap.anchor).toEqual({ wallId: "B", layer: "base", offsetMm: 1160, widthMm: 60 });
  });

  it("a hidden front is anchored to the part of it behind the other unit; a clash to the corner on the first wall", () => {
    const hidden = project([unit("a", "B600", "A", 2600, 600), unit("b", "B600", "B", 560, 600)]);
    const corner = runRawChecks(hidden, catalogue).find((r) => r.ruleId === "corner" && r.status !== "pass")!;
    expect(corner.anchor).toEqual({ wallId: "A", layer: "base", offsetMm: 2640, widthMm: 560 });
    const clash = project([unit("bc", "BC1000", "A", 2200, 1000, "base", { blindSide: "right" }), unit("b", "BD600", "B", 560, 600)]);
    const r = runRawChecks(clash, catalogue).find((x) => x.ruleId === "corner-clash" && x.status !== "pass")!;
    expect(r.anchor).toEqual({ wallId: "A", layer: "base", offsetMm: 2590, widthMm: 610 });
  });

  it("unit issues are anchored to the unit; fitted appliances to their host; the chimney to itself", () => {
    const win = checkCandidate(emptyMehta, catalogue, unit("t", "T600OM", "A", 1300, 600, "tall", { shutterTypeId: "appliance-housing" }));
    expect(win[0].anchor).toEqual({ wallId: "A", layer: "tall", offsetMm: 1300, widthMm: 600 });
    const sink = runRawChecks(project([unit("su", "SU900", "B", 600, 900)], [fitted("s", "sink", "su")]), catalogue).find((r) => r.ruleId === "sink-plumbing" && r.status !== "pass")!;
    expect(sink.anchor).toEqual({ wallId: "B", layer: "base", offsetMm: 600, widthMm: 900 });
    const off = { ...sampleDesign, appliances: sampleDesign.appliances.map((a) => (a.id === "a-chimney" && a.kind === "free" ? { ...a, offsetMm: 400 } : a)) };
    expect(runRawChecks(off, catalogue).find((r) => r.ruleId === "chimney-hob" && r.status !== "pass")!.anchor).toEqual({ wallId: "A", layer: "wall", offsetMm: 400, widthMm: 900 });
  });

  it("issues with no location have no anchor", () => {
    const r = runRawChecks({ ...sampleDesign, discountPct: 8 }, catalogue).find((x) => x.ruleId === "discount")!;
    expect(r.anchor).toBeUndefined();
  });
});

describe("appliance candidates", () => {
  it("a sink fitted into the SU900 under the plumbing point passes, fast and full", () => {
    const c = fitted("cand", "sink", "su");
    expect(checkPlacementFast(kitchen, catalogue, c).status).toBe("pass");
    expect(checkCandidate(kitchen, catalogue, c)).toEqual([]);
  });

  it("a hob in an HU900 under the window is blocked, with a move fix for the host", () => {
    const p = project([unit("hu", "HU900", "A", 1300, 900)]);
    const c = fitted("cand", "hob", "hu");
    expect(checkPlacementFast(p, catalogue, c)).toMatchObject({ status: "blocked", ruleId: "hob-window" });
    const [r] = checkCandidate(p, catalogue, c);
    expect(r.fixes[0]).toMatchObject({ label: "Move to Wall A, 2300–3200 mm", action: { type: "move", placementId: "hu", offsetMm: 2300 } });
    expectFixesWork(withPlacement(p, c), [r]);
  });

  it("a loose sink is blocked and offers a sink unit here with the sink, validated", () => {
    const c = loose("cand", "sink", "A", 1210);
    expect(checkPlacementFast(emptyMehta, catalogue, c)).toMatchObject({ status: "blocked", reason: "The single-bowl sink has to be fitted into a unit, not placed on its own." });
    const results = checkCandidate(emptyMehta, catalogue, c);
    expect(results.map((r) => r.ruleId)).toEqual(["appliance-host"]);
    const [fix] = results[0].fixes;
    expect(fix).toEqual({
      label: "Place a sink unit here with the sink",
      action: { type: "placeHostWithAppliance", moduleCode: "SU900", wallId: "A", offsetMm: 1210, applianceId: "sink", placementId: "cand" },
    });
    expectFixesWork(withPlacement(emptyMehta, c), results);
  });

  it("the composite fix places the host and fits the appliance in one action", () => {
    const after = applyFix(emptyMehta, catalogue, { type: "placeHostWithAppliance", moduleCode: "HU900", wallId: "A", offsetMm: 300, applianceId: "hob" });
    expect(after.modules).toEqual([expect.objectContaining({ moduleCode: "HU900", wallId: "A", offsetMm: 300, finishId: "matte-sage", shutterTypeId: "standard" })]);
    expect(after.appliances).toEqual([{ kind: "hosted", id: "a-hob", applianceId: "hob", hostPlacementId: after.modules[0].id }]);
    expect(runAllChecks(after, catalogue).filter((r) => r.status === "blocked")).toEqual([]);
    // A host that can't take the appliance is refused.
    expect(() => applyFix(emptyMehta, catalogue, { type: "placeHostWithAppliance", moduleCode: "B900", wallId: "A", offsetMm: 300, applianceId: "hob" })).toThrow();
  });

  it("no composite fix where the host would be unsafe: a sink on a wall without plumbing", () => {
    const results = checkCandidate(emptyMehta, catalogue, loose("cand", "sink", "B", 1000));
    expect(results[0].fixes.some((f) => f.action.type === "placeHostWithAppliance")).toBe(false);
  });

  it("a loose hob offers to fit into a free HU900; validated like every fix", () => {
    const c = loose("cand", "hob", "B", 1000);
    const results = checkCandidate(kitchen, catalogue, c);
    expect(results[0].fixes.map((f) => f.label)).toContain("Fit into HU900 on Wall A");
    const fix = results[0].fixes.find((f) => f.label === "Fit into HU900 on Wall A")!;
    expect(isFixSafe(withPlacement(kitchen, c), catalogue, results[0], fix)).toBe(true);
    expect(applyFix(withPlacement(kitchen, c), catalogue, fix.action).appliances).toEqual([fitted("cand", "hob", "hu")]);
  });

  it("a host takes one sink or hob; a T600OM one oven and one microwave", () => {
    const withSink = project(kitchen.modules, [fitted("s1", "sink", "su")]);
    const second = checkCandidate(withSink, catalogue, fitted("cand", "sink", "su"));
    expect(second[0]).toMatchObject({ ruleId: "host-capacity", status: "blocked", message: "SU900 on Wall A already has a single-bowl sink. Each unit takes one." });
    expect(checkPlacementFast(withSink, catalogue, fitted("cand", "sink", "su")).status).toBe("blocked");

    const tall = project([unit("t", "T600OM", "B", 1800, 600, "tall", { shutterTypeId: "appliance-housing" })], [fitted("o1", "oven", "t")]);
    expect(checkCandidate(tall, catalogue, fitted("cand", "microwave", "t"))).toEqual([]);
    const ovens = checkCandidate(tall, catalogue, fitted("cand", "oven", "t"));
    expect(ovens.map((r) => r.ruleId)).toEqual(["host-capacity"]);
    expect(ovens[0].fixes.map((f) => f.label)).toEqual(["Remove the extra built-in oven"]);
  });

  it("free appliances follow the placement rules: a chimney over the window, a dishwasher in an overlap", () => {
    expect(checkPlacementFast(emptyMehta, catalogue, loose("cand", "chimney", "A", 1300))).toMatchObject({ status: "blocked", ruleId: "covers-window" });
    expect(checkPlacementFast(kitchen, catalogue, loose("cand", "dishwasher", "A", 1000))).toMatchObject({ status: "blocked", ruleId: "overlap" });
    expect(checkPlacementFast(kitchen, catalogue, loose("cand", "dishwasher", "B", 600)).status).toBe("pass");
  });

  it("fast and full checks agree on appliance candidates", () => {
    const base = project(
      [...kitchen.modules, unit("t", "T600OM", "B", 1800, 600, "tall", { shutterTypeId: "appliance-housing" }), unit("hu2", "HU900", "B", 600, 900)],
      [fitted("s1", "sink", "su")],
    );
    const candidates: AppliancePlacement[] = [
      ...["sink", "hob", "oven", "microwave"].flatMap((id) => ["su", "hu", "t", "hu2"].map((host) => fitted("cand", id, host))),
      ...["sink", "hob", "oven", "chimney", "dishwasher", "fridge"].flatMap((id) =>
        ["A", "B", "C", "H"].flatMap((wallId) => [0, 400, 900, 1500].map((o) => loose("cand", id, wallId, o))),
      ),
    ];
    let blocked = 0;
    for (const c of candidates) {
      const fast = checkPlacementFast(base, catalogue, c).status === "blocked";
      expect(fast, `${c.applianceId} ${JSON.stringify(c)}`).toBe(hasBlocked(checkCandidate(base, catalogue, c)));
      if (fast) blocked++;
    }
    expect(blocked).toBeGreaterThan(20);
    expect(candidates.length - blocked).toBeGreaterThan(5);
  });
});
