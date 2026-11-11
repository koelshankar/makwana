import { getAppliance, getModule } from "../catalogue";
import { isAppliancePlacement, rangesOverlap } from "../geometry";
import type { Catalogue, CheckResult, PlumbingFeature, Project } from "../types";
import { getContext, mm, moveProposals, pass, wallName, type Entry } from "./context";

const CHIMNEY_TOLERANCE_MM = 50;
const SINK_PLUMBING_REACH_MM = 600;

const centre = (e: Entry) => (e.wb ? (e.wb.along[0] + e.wb.along[1]) / 2 : NaN);

function hostedEntries(project: Project, cat: Catalogue, applianceId: string) {
  const ctx = getContext(project, cat);
  return ctx.entries.filter(
    (e) => e.hosted && e.wb && isAppliancePlacement(e.placement) && e.placement.applianceId === applianceId,
  );
}

function hostId(e: Entry): string {
  const p = e.placement;
  return isAppliancePlacement(p) && p.kind === "hosted" ? p.hostPlacementId : e.id;
}

/** Rule 11: a hob whose host unit sits under a window. */
export function hobUnderWindowRule(project: Project, cat: Catalogue): CheckResult[] {
  const ctx = getContext(project, cat);
  const results: CheckResult[] = [];
  for (const hob of hostedEntries(project, cat, "hob")) {
    const host = ctx.entryById.get(hostId(hob));
    if (!host?.slot) continue;
    const hostRange: [number, number] = [host.slot.offsetMm, host.slot.offsetMm + host.slot.widthMm];
    for (const win of ctx.windows) {
      if (win.wallId !== host.slot.wallId) continue;
      if (!rangesOverlap(hostRange, [win.offsetMm, win.offsetMm + win.widthMm])) continue;
      results.push({
        ruleId: "hob-window",
        group: "appliance",
        status: "blocked",
        placementIds: [hob.id, host.id],
        message: `The hob on ${host.label} is under the window on ${wallName(win.wallId)}. Flames near a window are unsafe and the chimney can't be fitted.`,
        fixes: moveProposals(ctx, host.id, [host.slot.wallId]),
      });
    }
  }
  return results.length ? results : [pass("hob-window", "appliance", "Hob is away from windows")];
}

/** Rule 12: a chimney not centred within ±50 mm of a hob on the same wall. */
export function chimneyAboveHobRule(project: Project, cat: Catalogue): CheckResult[] {
  const ctx = getContext(project, cat);
  const hobs = hostedEntries(project, cat, "hob");
  const results: CheckResult[] = [];
  for (const chimney of ctx.entries) {
    if (chimney.hosted || !chimney.slot || !isAppliancePlacement(chimney.placement)) continue;
    if (chimney.placement.applianceId !== "chimney") continue;
    const wallHobs = hobs
      .filter((h) => h.wallId === chimney.slot!.wallId)
      .sort((a, b) => Math.abs(centre(a) - centre(chimney)) - Math.abs(centre(b) - centre(chimney)));
    const hob = wallHobs[0];
    if (hob && Math.abs(centre(hob) - centre(chimney)) <= CHIMNEY_TOLERANCE_MM) continue;

    const wall = wallName(chimney.slot.wallId);
    results.push({
      ruleId: "chimney-hob",
      group: "appliance",
      status: "warning",
      placementIds: hob ? [chimney.id, hob.id] : [chimney.id],
      message: hob
        ? `The chimney on ${wall} is ${mm(Math.abs(centre(hob) - centre(chimney)))} mm off the centre of the hob. It should be within ${CHIMNEY_TOLERANCE_MM} mm.`
        : `The chimney on ${wall} has no hob below it.`,
      fixes: hob
        ? [
            {
              label: "Centre the chimney over the hob",
              action: {
                type: "move",
                placementId: chimney.id,
                wallId: chimney.slot.wallId,
                offsetMm: Math.round(centre(hob) - chimney.slot.widthMm / 2),
              },
            },
          ]
        : [],
    });
  }
  return results.length ? results : [pass("chimney-hob", "appliance", "Chimney is centred over the hob")];
}

/** Rule 13: a sink more than 600 mm from a plumbing point on its wall. */
export function sinkNearPlumbingRule(project: Project, cat: Catalogue): CheckResult[] {
  const ctx = getContext(project, cat);
  const results: CheckResult[] = [];
  for (const sink of hostedEntries(project, cat, "sink")) {
    const host = ctx.entryById.get(hostId(sink));
    if (!host?.slot) continue;
    const wallId = host.slot.wallId;
    const points = project.room.features.filter(
      (f): f is PlumbingFeature => f.kind === "plumbing" && f.wallId === wallId,
    );
    const c = centre(sink);
    const nearest = points.sort((a, b) => Math.abs(a.offsetMm - c) - Math.abs(b.offsetMm - c))[0];
    if (nearest && Math.abs(nearest.offsetMm - c) <= SINK_PLUMBING_REACH_MM) continue;

    const target = nearest ? Math.round(nearest.offsetMm - host.slot.widthMm / 2) : undefined;
    results.push({
      ruleId: "sink-plumbing",
      group: "appliance",
      status: "blocked",
      placementIds: [sink.id, host.id],
      message: nearest
        ? `The sink is ${mm(Math.abs(nearest.offsetMm - c))} mm from the plumbing point on ${wallName(wallId)}. It must be within ${SINK_PLUMBING_REACH_MM} mm.`
        : `There is no plumbing point on ${wallName(wallId)} for the sink.`,
      fixes:
        target !== undefined
          ? [
              {
                label: `Move ${host.label} over the plumbing point`,
                action: { type: "move", placementId: host.id, wallId, offsetMm: target },
              },
            ]
          : [],
    });
  }
  return results.length ? results : [pass("sink-plumbing", "appliance", "Sink is near the plumbing point")];
}

/** Hosted appliances need a compatible host; free ones must sit in their own layer. */
export function applianceHostRule(project: Project, cat: Catalogue): CheckResult[] {
  const results: CheckResult[] = [];
  const seen = new Set<string>();
  for (const a of project.appliances) {
    const spec = getAppliance(cat, a.applianceId);
    const remove = [{ label: `Remove the ${spec.name.toLowerCase()}`, action: { type: "remove" as const, placementId: a.id } }];
    const fail = (message: string) =>
      results.push({ ruleId: "appliance-host", group: "appliance", status: "blocked", placementIds: [a.id], message, fixes: remove });

    if (a.kind === "free") {
      if (spec.hosted) fail(`The ${spec.name.toLowerCase()} has to be fitted into a unit, not placed on its own.`);
      else if (a.layer !== spec.layer) fail(`The ${spec.name.toLowerCase()} belongs in the ${spec.layer} row, not the ${a.layer} row.`);
      continue;
    }
    const host = project.modules.find((m) => m.id === a.hostPlacementId);
    if (!host) {
      fail(`The ${spec.name.toLowerCase()} has lost the unit it was fitted into.`);
      continue;
    }
    const mod = getModule(cat, host.moduleCode);
    if (!mod.hosts?.includes(spec.id)) {
      fail(`A ${spec.name.toLowerCase()} can't be fitted into ${mod.code}.`);
      continue;
    }
    const key = `${host.id}:${spec.id}`;
    if (seen.has(key)) fail(`${mod.code} already has a ${spec.name.toLowerCase()}.`);
    seen.add(key);
  }
  return results.length ? results : [pass("appliance-host", "appliance", "Appliances are fitted correctly")];
}
