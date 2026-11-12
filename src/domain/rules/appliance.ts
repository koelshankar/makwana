import { getAppliance, getModule } from "../catalogue";
import { isAppliancePlacement, rangesOverlap } from "../geometry";
import type { Catalogue, CatalogueModule, CheckResult, FixAction, Fix, FreeAppliancePlacement, ModulePlacement, PlumbingFeature, Project } from "../types";
import { getContext, mm, moveProposals, occupancy, pass, propose, wallName, type Entry, type RuleContext, type RuleOptions } from "./context";

const CHIMNEY_TOLERANCE_MM = 50;
const SINK_PLUMBING_REACH_MM = 600;

const centre = (e: Entry) => (e.wb ? (e.wb.along[0] + e.wb.along[1]) / 2 : NaN);

function hostedEntries(project: Project, cat: Catalogue, applianceId: string) {
  const ctx = getContext(project, cat);
  return ctx.entries.filter(
    (e) => e.hosted && e.wb && isAppliancePlacement(e.placement) && e.placement.kind === "hosted" && e.placement.applianceId === applianceId,
  );
}

function hostId(e: Entry): string {
  const p = e.placement;
  return isAppliancePlacement(p) && p.kind === "hosted" ? p.hostPlacementId : e.id;
}

/** Rule 11: a hob whose host unit sits under a window. */
export function hobUnderWindowRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
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
        fixes: propose(opts, () => moveProposals(ctx, host.id, [host.slot!.wallId])),
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
export function sinkNearPlumbingRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
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
        target !== undefined && opts.fixes !== false
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

// ---------------------------------------------------------------------------
// Hosts

/** The catalogue unit that takes an appliance: SU900 for a sink, HU900 for a hob, T600OM for an oven or microwave. */
export function hostModuleFor(cat: Catalogue, applianceId: string): CatalogueModule | undefined {
  return cat.modules.find((m) => m.hosts?.includes(applianceId));
}

/** Units that can take this appliance and don't have one yet (ignoring `exceptId`). */
export function freeHosts(project: Project, cat: Catalogue, applianceId: string, exceptId?: string): ModulePlacement[] {
  return project.modules
    .filter((m) => getModule(cat, m.moduleCode).hosts?.includes(applianceId))
    .filter((m) => !project.appliances.some((a) => a.id !== exceptId && a.kind === "hosted" && a.hostPlacementId === m.id && a.applianceId === applianceId))
    .sort((a, b) => a.wallId.localeCompare(b.wallId) || a.offsetMm - b.offsetMm);
}

/** "Fit into HU900 on Wall A" for every unit that could take the appliance. */
function attachFixes(project: Project, cat: Catalogue, placementId: string, applianceId: string): Fix[] {
  return freeHosts(project, cat, applianceId, placementId).map((h) => ({
    label: `Fit into ${h.moduleCode} on ${wallName(h.wallId)}`,
    action: { type: "attach", placementId, hostPlacementId: h.id },
  }));
}

const HERE_LABELS: Record<string, [string, string]> = {
  sink: ["a sink unit", "sink"],
  hob: ["a hob unit", "hob"],
  oven: ["a tall housing", "oven"],
  microwave: ["a tall housing", "microwave"],
};

/**
 * "Place a sink unit here with the sink": a host unit where a loose appliance was dropped,
 * centred on it, or the nearest clear position. The engine keeps the first one that is safe.
 */
function placeHostFixes(ctx: RuleContext, a: FreeAppliancePlacement): Fix[] {
  const mod = hostModuleFor(ctx.cat, a.applianceId);
  const frame = ctx.frameById.get(a.wallId);
  if (!mod || mod.layer === "any" || !frame || frame.lengthMm < mod.widthMm) return [];
  const w = mod.widthMm;
  const spec = getAppliance(ctx.cat, a.applianceId);
  const max = frame.lengthMm - w;
  const centred = Math.min(max, Math.max(0, Math.round((a.offsetMm + spec.widthMm / 2 - w / 2) / 10) * 10));
  const occ = occupancy(ctx, a.wallId, mod.layer, a.id).map((o) => o.along);
  const offsets = new Set<number>([centred, 0, max]);
  for (const [a0, a1] of occ) {
    offsets.add(a1);
    offsets.add(a0 - w);
  }
  const [unit, short] = HERE_LABELS[a.applianceId] ?? [`a ${mod.code}`, spec.name.toLowerCase()];
  return [...offsets]
    .filter((o) => o >= 0 && o <= max && !occ.some((r) => rangesOverlap(r, [o, o + w])))
    .sort((x, y) => Math.abs(x - centred) - Math.abs(y - centred))
    .map((o) => {
      const action: FixAction = { type: "placeHostWithAppliance", moduleCode: mod.code, wallId: a.wallId, offsetMm: o, applianceId: a.applianceId, placementId: a.id };
      return { label: o === centred ? `Place ${unit} here with the ${short}` : `Place ${unit} at ${mm(o)}–${mm(o + w)} mm with the ${short}`, action };
    });
}

/** Hosted appliances need a compatible host; free ones must sit in their own layer. */
export function applianceHostRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const ctx = getContext(project, cat);
  const results: CheckResult[] = [];
  for (const a of project.appliances) {
    const spec = getAppliance(cat, a.applianceId);
    const name = spec.name.toLowerCase();
    const remove: Fix = { label: `Remove the ${name}`, action: { type: "remove", placementId: a.id } };
    const fail = (message: string, fixes: () => Fix[]) =>
      results.push({ ruleId: "appliance-host", group: "appliance", status: "blocked", placementIds: [a.id], message, fixes: propose(opts, fixes) });

    if (a.kind === "free") {
      if (spec.hosted) {
        fail(`The ${name} has to be fitted into a unit, not placed on its own.`, () => [
          ...placeHostFixes(ctx, a),
          ...attachFixes(project, cat, a.id, a.applianceId),
        ]);
      } else if (a.layer !== spec.layer) {
        fail(`The ${name} belongs in the ${spec.layer} row, not the ${a.layer} row.`, () => [remove]);
      }
      continue;
    }
    const host = project.modules.find((m) => m.id === a.hostPlacementId);
    if (!host) {
      fail(`The ${name} has lost the unit it was fitted into.`, () => [...attachFixes(project, cat, a.id, a.applianceId), remove]);
      continue;
    }
    const mod = getModule(cat, host.moduleCode);
    if (!mod.hosts?.includes(spec.id)) {
      const fits = hostModuleFor(cat, spec.id);
      fail(`A ${name} can't be fitted into ${mod.code}${fits ? `; it needs ${fits.code}` : ""}.`, () => [...attachFixes(project, cat, a.id, a.applianceId), remove]);
    }
  }
  return results.length ? results : [pass("appliance-host", "appliance", "Appliances are fitted correctly")];
}

/** A unit takes one of each appliance it hosts: one sink, one hob, or one oven and one microwave. */
export function hostCapacityRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const results: CheckResult[] = [];
  const seen = new Set<string>();
  for (const a of project.appliances) {
    if (a.kind !== "hosted") continue;
    const host = project.modules.find((m) => m.id === a.hostPlacementId);
    if (!host || !getModule(cat, host.moduleCode).hosts?.includes(a.applianceId)) continue;
    const key = `${host.id}:${a.applianceId}`;
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }
    const name = getAppliance(cat, a.applianceId).name.toLowerCase();
    results.push({
      ruleId: "host-capacity",
      group: "appliance",
      status: "blocked",
      placementIds: [a.id],
      message: `${host.moduleCode} on ${wallName(host.wallId)} already has a ${name}. Each unit takes one.`,
      fixes: propose(opts, () => [
        ...attachFixes(project, cat, a.id, a.applianceId).filter((f) => f.action.type === "attach" && f.action.hostPlacementId !== host.id),
        { label: `Remove the extra ${name}`, action: { type: "remove", placementId: a.id } },
      ]),
    });
  }
  return results.length ? results : [pass("host-capacity", "appliance", "Each unit has at most one of each appliance")];
}
