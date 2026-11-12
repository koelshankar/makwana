import { findModule, getModule } from "../catalogue";
import { beamToBox, isModulePlacement, isRoomClosed, rangesOverlap } from "../geometry";
import type { BeamFeature, Catalogue, CheckResult, Fix, Project } from "../types";
import { boxesOverlap, getContext, kindLabel, mm, moveProposals, nextWallId, pass, propose, wallName, type RuleOptions } from "./context";

/** The room must be a closed polygon before design can be trusted. */
export function roomClosedRule(project: Project): CheckResult[] {
  if (isRoomClosed(project.room)) return [pass("room-closed", "room", "Room is closed")];
  return [
    {
      ruleId: "room-closed",
      group: "room",
      status: "blocked",
      placementIds: [],
      message: "The room isn't closed yet. Add walls until the last wall ends where Wall A starts.",
      fixes: [],
    },
  ];
}

/** Rule 3: a wall, loft or tall unit (or chimney) whose height range overlaps a window. */
export function coversWindowRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const ctx = getContext(project, cat);
  const results: CheckResult[] = [];
  for (const win of ctx.windows) {
    for (const e of ctx.entries) {
      if (!e.slot || !e.wb || e.hosted || e.slot.layer === "base" || e.slot.wallId !== win.wallId) continue;
      const winRange: [number, number] = [win.offsetMm, win.offsetMm + win.widthMm];
      if (!rangesOverlap(e.wb.along, winRange) || !rangesOverlap(e.wb.z, [win.sillMm, win.topMm])) continue;
      const kind = kindLabel(ctx, e.id);
      const size =
        e.slot.layer === "tall" ? `is ${mm(e.wb.z[1] - e.wb.z[0])} mm tall` : `sits ${mm(e.wb.z[0])}–${mm(e.wb.z[1])} mm above the floor`;
      const next = nextWallId(ctx, win.wallId);
      results.push({
        ruleId: "covers-window",
        group: "room",
        status: "blocked",
        placementIds: [e.id],
        message:
          `${kind} cannot be placed over a window. ${e.label} ${size} and would cover the window on ` +
          `${wallName(win.wallId)} (${mm(winRange[0])}–${mm(winRange[1])} mm from the corner).`,
        fixes: propose(opts, () => moveProposals(ctx, e.id, next && next !== win.wallId ? [win.wallId, next] : [win.wallId])),
      });
    }
  }
  return results.length ? results : [pass("covers-window", "room", "Windows are clear")];
}

/** Rule 4: anything standing in a door opening (base, tall, and wall units below door height). */
export function blocksDoorRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const ctx = getContext(project, cat);
  const results: CheckResult[] = [];
  for (const door of ctx.doors) {
    for (const e of ctx.entries) {
      if (e.hosted || !boxesOverlap(e.box, door.box)) continue;
      const f = door.feature;
      results.push({
        ruleId: "blocks-door",
        group: "room",
        status: "blocked",
        placementIds: [e.id],
        message: `${e.label} blocks the door on ${wallName(f.wallId)} (${mm(f.offsetMm)}–${mm(f.offsetMm + f.widthMm)} mm from the corner).`,
        fixes: propose(opts, () => (e.slot ? moveProposals(ctx, e.id, [e.slot.wallId]) : [])),
      });
    }
  }
  return results.length ? results : [pass("blocks-door", "room", "Doors are clear")];
}

/** Short-loft replacement for an L-series loft, if one exists. */
function shortLoftFix(project: Project, cat: Catalogue, id: string): Fix[] {
  const p = project.modules.find((m) => m.id === id);
  if (!p) return [];
  const mod = getModule(cat, p.moduleCode);
  if (mod.family !== "L") return [];
  const short = findModule(cat, `LS${mod.widthMm}`);
  return short ? [{ label: `Use ${short.code} short loft (300 mm)`, action: { type: "replace", placementId: id, moduleCode: short.code } }] : [];
}

/** Rule 5: top of a unit above the ceiling. */
export function aboveCeilingRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const ctx = getContext(project, cat);
  const ceiling = project.room.ceilingHeightMm;
  const results: CheckResult[] = ctx.entries
    .filter((e) => e.box && e.box.maxZ > ceiling)
    .map((e) => ({
      ruleId: "above-ceiling",
      group: "room" as const,
      status: "blocked" as const,
      placementIds: [e.id],
      message: `${e.label} reaches ${mm(e.box!.maxZ)} mm, above the ${mm(ceiling)} mm ceiling.`,
      fixes: propose(opts, () => shortLoftFix(project, cat, e.id)),
    }));
  return results.length ? results : [pass("above-ceiling", "room", `Fits under ceiling ${mm(ceiling)}`)];
}

/** Rule 6: a unit whose box runs into a beam (the beam projects `depthMm` from its wall). */
export function beamRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const ctx = getContext(project, cat);
  const beams = project.room.features.filter((f): f is BeamFeature => f.kind === "beam");
  const results: CheckResult[] = [];
  for (const beam of beams) {
    const beamBox = beamToBox(project.room, beam);
    for (const e of ctx.entries) {
      if (e.hosted || !e.box || !boxesOverlap(e.box, beamBox)) continue;
      const isLoft = isModulePlacement(e.placement) && e.placement.layer === "loft";
      results.push({
        ruleId: "beam",
        group: "room",
        status: "blocked",
        placementIds: [e.id],
        message:
          `${e.label} ${isLoft ? "loft " : ""}reaches ${mm(e.box.maxZ)} mm, but the beam on ${wallName(beam.wallId)} ` +
          `comes down to ${mm(beam.bottomMm)} mm.`,
        fixes: propose(opts, () => shortLoftFix(project, cat, e.id)),
      });
    }
  }
  return results.length ? results : [pass("beam", "room", "Clear of beams")];
}

/** Rule 7: a placement's footprint intersects a column. */
export function columnRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const ctx = getContext(project, cat);
  const results: CheckResult[] = [];
  for (const col of ctx.columns) {
    for (const e of ctx.entries) {
      if (e.hosted || !boxesOverlap(e.box, col.box)) continue;
      results.push({
        ruleId: "column",
        group: "room",
        status: "blocked",
        placementIds: [e.id],
        message: `${e.label} runs into the ${mm(col.feature.widthMm)} × ${mm(col.feature.depthMm)} mm column.`,
        fixes: propose(opts, () => (e.slot ? moveProposals(ctx, e.id, [e.slot.wallId]) : [])),
      });
    }
  }
  return results.length ? results : [pass("column", "room", "Clear of columns")];
}
