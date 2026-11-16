// Inside-corner rules (Feedback 2, item 4). Where two walls meet at an inside corner, a unit on one
// wall and a unit on the other can get in each other's way in two ways:
//
//  a) Hidden front ("corner"): part of one unit's front stands behind the other unit's side, so its
//     doors or drawers can't open there. Blocked for every unit type. Fix: move it clear of the corner.
//  b) Handle clash ("corner-clash"): both fronts reach the point where they meet without the
//     clearance handles and drawers need. Blocked when either unit is tall, a warning otherwise.
//     Fix: a corner filler (the FIL "Filler panel") at the clearance width; one unit moves along its
//     wall by that width.
//
// Height bands decide whether two units meet at all: units in the same layer do (lofts with lofts),
// and a tall unit meets every layer. A base unit next to a wall unit doesn't.
//
// Positions here are distances from the corner along each wall, so both walls read the same way
// whichever end of the wall the corner is at.

import { FILLER_MAX_MM, getModule } from "../catalogue";
import { blindRange, insideCorners, isModulePlacement, worldToWall, type InsideCorner, type WallFrame } from "../geometry";
import type { Anchor, BlindSide, Catalogue, CheckResult, Fix, Layer, ModulePlacement, Project } from "../types";
import { getContext, mm, occupancy, pass, propose, wallName, type Entry, type RuleContext, type RuleOptions } from "./context";

/**
 * TO CONFIRM WITH MAKWANA. The clearance two fronts need where they meet at an inside corner, so
 * handles, doors and drawers don't collide: the width of the corner filler. One figure per handle
 * type. Both are placeholders (50 mm), not from Makwana's hardware spec. Over 100 mm (FILLER_MAX_MM)
 * the FIL "Filler panel" can't be used and the fix isn't offered.
 */
export const CORNER_CLEARANCE_MM = {
  /** "Standard with handle" (and every shutter type that isn't handleless). */
  handle: 50,
  /** "Handleless profile". */
  handleless: 50,
} as const;

/** The clearance a unit's front needs at a corner, from its shutter type. */
export function cornerClearance(shutterTypeId: string): number {
  return shutterTypeId === "handleless" ? CORNER_CLEARANCE_MM.handleless : CORNER_CLEARANCE_MM.handle;
}

/** Height bands that meet at a corner: the same layer, or either unit tall. */
export function bandsClash(a: Layer, b: Layer): boolean {
  return a === b || a === "tall" || b === "tall";
}

/** A unit standing on one of a corner's walls, in distances from the corner. */
interface CornerUnit {
  entry: Entry;
  placement: ModulePlacement;
  frame: WallFrame;
  /** The corner is at offset 0 of this wall (else at its far end). */
  atStart: boolean;
  near: number;
  far: number;
  /** How far its front stands out from the wall. */
  depth: number;
  /** The part of its front that opens (a blind section doesn't); null if unknown (no blind side set). */
  opening: [number, number] | null;
}

export interface HiddenFront {
  corner: InsideCorner;
  /** The unit whose front is hidden, and the unit whose side hides it. */
  hidden: CornerUnit;
  by: CornerUnit;
  hiddenMm: number;
}

export interface HandleClash {
  corner: InsideCorner;
  /** `first` sits nearer the corner. */
  first: CornerUnit;
  second: CornerUnit;
  clearanceMm: number;
  tall: boolean;
}

export interface CornerAnalysis {
  hidden: HiddenFront[];
  clashes: HandleClash[];
}

const toDistance = (u: { frame: WallFrame; atStart: boolean }, range: [number, number]): [number, number] =>
  u.atStart ? range : [u.frame.lengthMm - range[1], u.frame.lengthMm - range[0]];

/** Wall offset of a stretch that starts `distance` from the corner and is `width` long. */
const toOffset = (u: { frame: WallFrame; atStart: boolean }, distance: number, width: number) =>
  u.atStart ? distance : u.frame.lengthMm - distance - width;

function cornerUnits(ctx: RuleContext, frame: WallFrame, corner: InsideCorner): CornerUnit[] {
  const atStart = Math.abs(worldToWall(frame, corner.point).offsetMm) < 0.5;
  const out: CornerUnit[] = [];
  for (const entry of ctx.entries) {
    const p = entry.placement;
    if (!entry.slot || entry.slot.wallId !== frame.wallId || entry.hosted || entry.isFiller || !entry.wb || !isModulePlacement(p)) continue;
    const base = { frame, atStart };
    const [near, far] = toDistance(base, [p.offsetMm, p.offsetMm + p.widthMm]);
    const mod = getModule(ctx.cat, p.moduleCode);
    let opening: [number, number] | null = [near, far];
    if (mod.hasBlindSide) {
      const blind = blindRange(p);
      if (!blind) opening = null; // the blind-side rule asks for one
      else {
        const [b0, b1] = toDistance(base, blind);
        opening = b0 <= near ? [b1, far] : [near, b0];
      }
    }
    out.push({ entry, placement: p, frame, atStart, near, far, depth: entry.wb.depth[1], opening });
  }
  return out;
}

/** `hidden`'s front stands behind `by`'s side, too close to open. */
function hiddenBy(hidden: CornerUnit, by: CornerUnit): number {
  if (!hidden.opening || hidden.opening[1] <= hidden.opening[0]) return 0;
  // `by` stands in front of `hidden`'s front, closer than a door or drawer needs to open (its depth).
  if (by.near < hidden.depth || by.near - hidden.depth >= hidden.depth) return 0;
  return Math.max(0, Math.min(hidden.opening[1], by.depth) - hidden.opening[0]);
}

const analyses = new WeakMap<RuleContext, CornerAnalysis>();

/** Every hidden front and handle clash in the project. One hidden-front message per unit per corner. */
export function analyseCorners(ctx: RuleContext): CornerAnalysis {
  const cached = analyses.get(ctx);
  if (cached) return cached;
  const hidden: HiddenFront[] = [];
  const clashes: HandleClash[] = [];

  for (const corner of insideCorners(ctx.project.room)) {
    const f1 = ctx.frameById.get(corner.fromWallId);
    const f2 = ctx.frameById.get(corner.toWallId);
    if (!f1 || !f2) continue;
    const units1 = cornerUnits(ctx, f1, corner);
    const units2 = cornerUnits(ctx, f2, corner);

    const here: HiddenFront[] = [];
    const pairs: [CornerUnit, CornerUnit][] = [];
    for (const u of units1) {
      for (const v of units2) {
        if (!bandsClash(u.placement.layer, v.placement.layer)) continue;
        // Standing in each other's footprint: the overlap rule's business (or a tall unit under a loft).
        if (u.near < v.depth && v.near < u.depth) continue;
        const uh = hiddenBy(u, v);
        const vh = hiddenBy(v, u);
        if (uh > 0) here.push({ corner, hidden: u, by: v, hiddenMm: uh });
        else if (vh > 0) here.push({ corner, hidden: v, by: u, hiddenMm: vh });
        else pairs.push([u, v]);
      }
    }
    // The nearest neighbour speaks for each hidden unit.
    here.sort((a, b) => a.by.near - b.by.near);
    const reported = new Set<string>();
    for (const h of here) {
      if (reported.has(h.hidden.entry.id)) continue;
      reported.add(h.hidden.entry.id);
      hidden.push(h);
    }

    for (const [u, v] of pairs) {
      if (reported.has(u.entry.id) || reported.has(v.entry.id) || !u.opening || !v.opening) continue;
      const clearanceMm = Math.max(cornerClearance(u.placement.shutterTypeId), cornerClearance(v.placement.shutterTypeId));
      // How far each front starts past the other's front: under the clearance on both sides, they clash.
      const du = u.opening[0] - v.depth;
      const dv = v.opening[0] - u.depth;
      if (du < 0 || dv < 0 || du >= clearanceMm || dv >= clearanceMm) continue;
      const [first, second] = u.near <= v.near ? [u, v] : [v, u];
      clashes.push({ corner, first, second, clearanceMm, tall: u.placement.layer === "tall" || v.placement.layer === "tall" });
    }
  }

  const result = { hidden, clashes };
  analyses.set(ctx, result);
  return result;
}

/**
 * Corner stretches where a handle clash is reported: from the corner to the other unit's front plus
 * the clearance, per wall and layer. The leftover-gap rule leaves gaps there to the clash rule, so a
 * filler that only closes the gap isn't offered next to one that fixes the clash.
 */
export function clashZones(ctx: RuleContext): { wallId: string; layer: Layer; along: [number, number] }[] {
  return analyseCorners(ctx).clashes.flatMap((c) =>
    [
      [c.first, c.second],
      [c.second, c.first],
    ].map(([u, other]) => {
      const reach = other.depth + c.clearanceMm;
      const offset = toOffset(u, 0, reach);
      return { wallId: u.frame.wallId, layer: u.placement.layer, along: [offset, offset + reach] as [number, number] };
    }),
  );
}

const cornerName = (c: InsideCorner) => `the corner of ${wallName(c.fromWallId)} and ${wallName(c.toWallId)}`;

function anchorOf(u: CornerUnit, distance: [number, number]): Anchor {
  const widthMm = Math.max(0, Math.min(u.frame.lengthMm, distance[1]) - distance[0]);
  return { wallId: u.frame.wallId, layer: u.placement.layer, offsetMm: toOffset(u, distance[0], widthMm), widthMm };
}

/** Offsets that put `u`'s front at least `from` along from the corner, nearest the corner first, clear of its layer's band. */
function clearSpots(ctx: RuleContext, u: CornerUnit, from: number): number[] {
  const w = u.placement.widthMm;
  const L = u.frame.lengthMm;
  const lead = u.opening ? u.opening[0] - u.near : 0; // a blind section on the corner side
  const minNear = Math.max(0, from - lead);
  const blockers = occupancy(ctx, u.frame.wallId, u.placement.layer, u.entry.id).map((o) => toDistance(u, o.along));
  if (u.placement.layer !== "base") {
    for (const win of ctx.windows) {
      if (win.wallId === u.frame.wallId) blockers.push(toDistance(u, [win.offsetMm, win.offsetMm + win.widthMm]));
    }
  }
  const candidates = new Set([minNear, ...blockers.map((b) => b[1])]);
  return [...candidates]
    .filter((d) => d >= minNear && d + w <= L && d !== u.near)
    .filter((d) => !blockers.some(([b0, b1]) => b0 < d + w && d < b1))
    .sort((a, b) => a - b)
    .map((d) => toOffset(u, d, w));
}

/**
 * Case a): a unit's front is hidden behind the side of a unit on the other wall of an inside corner.
 * Blocked. Fix: "Move clear of corner". The old corner rule (no blind corner unit, or its blind side
 * facing away) is this case for base units; its fixes are kept after the move.
 */
export function cornerRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const ctx = getContext(project, cat);
  const results: CheckResult[] = analyseCorners(ctx).hidden.map((h) => {
    const s = h.hidden;
    const wall = wallName(s.frame.wallId);
    const mod = getModule(cat, s.placement.moduleCode);
    const blindAway = !!mod.hasBlindSide && !!s.opening && s.opening[0] === s.near;
    const clearance = Math.max(cornerClearance(s.placement.shutterTypeId), cornerClearance(h.by.placement.shutterTypeId));
    // Clear of the side, and of the handles if the neighbour's front starts right at this front.
    const frontNear = h.by.opening && h.by.opening[0] - s.depth < clearance;
    const target = h.by.depth + (frontNear ? clearance : 0);
    const message =
      `${s.entry.label}'s front is behind the side of ${h.by.entry.label} at ${cornerName(h.corner)}. ` +
      `${mm(h.hiddenMm)} mm of it can't open: move ${s.entry.label} along ${wall} until its front is clear` +
      (blindAway ? ", or turn its blind side to the corner." : ".");
    return {
      ruleId: "corner",
      group: "fit" as const,
      status: "blocked" as const,
      placementIds: [s.entry.id, h.by.entry.id],
      message,
      fixes: propose(opts, () => {
        const fixes: Fix[] = clearSpots(ctx, s, target).map((offsetMm) => ({
          label: "Move clear of corner",
          action: { type: "move", placementId: s.entry.id, wallId: s.frame.wallId, offsetMm },
        }));
        if (blindAway) {
          const side: BlindSide = s.atStart ? "left" : "right";
          fixes.push({ label: `Make the blind side ${side}`, action: { type: "setBlindSide", placementId: s.entry.id, blindSide: side } });
        } else if (s.placement.layer === "base" && !mod.hasBlindSide && s.frame.lengthMm >= 1000) {
          fixes.push({
            label: `Replace ${s.entry.label} on ${wall} with BC1000 in the corner`,
            action: { type: "replaceAndMove", placementId: s.entry.id, moduleCode: "BC1000", offsetMm: toOffset(s, 0, 1000) },
          });
        }
        return fixes;
      }),
      noFixReason: { label: "Move clear of corner", reason: `There is no free spot on ${wall} where its front is clear.` },
      anchor: anchorOf(s, [Math.max(s.near, s.opening?.[0] ?? s.near), h.by.depth]),
    };
  });
  return results.length ? results : [pass("corner", "fit", "No fronts hidden in a corner")];
}

/** "Add corner filler" for one unit of a clash: the filler where its front would start, the unit (and any it butts) moved on. */
function cornerFillerFix(c: HandleClash, u: CornerUnit, other: CornerUnit): Fix | null {
  const lead = u.opening![0] - u.near;
  const gap = u.opening![0] - other.depth; // 0 ≤ gap < clearance
  const shift = c.clearanceMm - gap;
  const fillerFrom = u.near - gap;
  if (fillerFrom < 0 || c.clearanceMm > FILLER_MAX_MM || lead < 0) return null;
  return {
    label: "Add corner filler",
    action: {
      type: "addCornerFiller",
      placementId: u.entry.id,
      offsetMm: toOffset(u, u.near + shift, u.placement.widthMm),
      fillerOffsetMm: toOffset(u, fillerFrom, c.clearanceMm),
      widthMm: c.clearanceMm,
    },
  };
}

/**
 * Case b): two fronts meet at an inside corner with less than the handle clearance between them.
 * Blocked if either unit is tall, a warning for base and wall units. Fix: "Add corner filler".
 */
export function cornerClashRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const ctx = getContext(project, cat);
  const results: CheckResult[] = analyseCorners(ctx).clashes.map((c) => {
    const { first: a, second: b } = c;
    const walls = `${wallName(a.frame.wallId)} nor ${wallName(b.frame.wallId)}`;
    return {
      ruleId: "corner-clash",
      group: "fit" as const,
      status: c.tall ? ("blocked" as const) : ("warning" as const),
      placementIds: [a.entry.id, b.entry.id],
      message:
        `Handles clash where ${a.entry.label} and ${b.entry.label} meet at ${cornerName(c.corner)}. ` +
        `The fronts need ${mm(c.clearanceMm)} mm between them: add a corner filler.`,
      // The filler goes first where a front already stands off the other (it fills that gap), else
      // behind the unit nearer the corner (a blind corner unit is pulled out of the corner).
      fixes: propose(opts, () => {
        const gapA = a.opening![0] - b.depth;
        const gapB = b.opening![0] - a.depth;
        const order: [CornerUnit, CornerUnit][] = gapB > gapA ? [[b, a], [a, b]] : [[a, b], [b, a]];
        return order.map(([u, other]) => cornerFillerFix(c, u, other)).filter((f): f is Fix => !!f);
      }),
      noFixReason: {
        label: "Add corner filler",
        reason:
          c.clearanceMm > FILLER_MAX_MM
            ? `The clearance is wider than a filler panel (${FILLER_MAX_MM} mm).`
            : `Neither ${walls} has room to move a unit ${mm(c.clearanceMm)} mm along.`,
      },
      anchor: anchorOf(a, [a.near, b.depth + c.clearanceMm]),
    };
  });
  return results.length ? results : [pass("corner-clash", "fit", "Fronts clear each other at the corners")];
}
