import { FILLER_MAX_MM, getModule, moduleInFamily } from "../catalogue";
import { isModulePlacement, isRoomClosed, signedArea, wallSegments, worldToWall } from "../geometry";
import type { BlindSide, Catalogue, CheckResult, Fix, Layer, ModulePlacement, Project } from "../types";
import {
  boxesOverlap,
  getContext,
  mm,
  moveProposals,
  occupancy,
  pass,
  propose,
  wallName,
  type RuleOptions,
  type Occupant,
  type RuleContext,
} from "./context";

const MIN_USEFUL_GAP_MM = 300;

/** The catalogue (non-filler) module behind an occupant, if it is one. */
function ownModule(ctx: RuleContext, occ: Occupant | undefined): ModulePlacement | undefined {
  const p = occ?.placementId ? ctx.entryById.get(occ.placementId)?.placement : undefined;
  if (!p || !isModulePlacement(p) || getModule(ctx.cat, p.moduleCode).family === "FIL") return undefined;
  return p;
}
const CORNER_REACH_MM = 1000;

/** Rule 1: two placements' world boxes intersect, including across a corner. */
export function overlapRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const ctx = getContext(project, cat);
  const solid = ctx.entries.filter((e) => !e.hosted && e.box);
  const results: CheckResult[] = [];
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i];
      const b = solid[j];
      if (!boxesOverlap(a.box, b.box)) continue;
      const where =
        a.wallId === b.wallId
          ? `on ${wallName(a.wallId ?? "?")}`
          : `at the corner of ${wallName(a.wallId ?? "?")} and ${wallName(b.wallId ?? "?")}`;
      results.push({
        ruleId: "overlap",
        group: "fit",
        status: "blocked",
        placementIds: [a.id, b.id],
        message: `${b.label} overlaps ${a.label} ${where}.`,
        fixes: propose(opts, () => [
          ...moveProposals(ctx, b.id, [b.slot!.wallId]),
          ...moveProposals(ctx, a.id, [a.slot!.wallId]),
        ]),
      });
    }
  }
  return results.length ? results : [pass("overlap", "fit", "No units overlap")];
}

/** Rule 2: placement runs off either end of its wall, or its wall no longer exists. */
export function outsideWallRule(project: Project, cat: Catalogue, opts: RuleOptions = {}): CheckResult[] {
  const ctx = getContext(project, cat);
  const results: CheckResult[] = [];
  for (const e of ctx.entries) {
    if (!e.slot) continue;
    const frame = ctx.frameById.get(e.slot.wallId);
    if (!frame) {
      results.push({
        ruleId: "outside-wall",
        group: "fit",
        status: "blocked",
        placementIds: [e.id],
        message: `${e.label} is on ${wallName(e.slot.wallId)}, which no longer exists.`,
        fixes: [{ label: `Remove ${e.label}`, action: { type: "remove", placementId: e.id } }],
      });
      continue;
    }
    const start = e.slot.offsetMm;
    const end = start + e.slot.widthMm;
    if (start >= 0 && end <= frame.lengthMm) continue;
    const message =
      start < 0
        ? `${e.label} starts ${mm(-start)} mm before the beginning of ${wallName(frame.wallId)}.`
        : `${e.label} runs ${mm(end - frame.lengthMm)} mm past the end of ${wallName(frame.wallId)}.`;
    results.push({
      ruleId: "outside-wall",
      group: "fit",
      status: "blocked",
      placementIds: [e.id],
      message,
      fixes: propose(opts, () => moveProposals(ctx, e.id, [frame.wallId])),
    });
  }
  return results.length ? results : [pass("outside-wall", "fit", "All units fit within their walls")];
}

const LAYER_SUFFIX: Record<Layer, string> = { base: "", wall: " (wall units)", loft: " (lofts)", tall: " (tall units)" };
const LAYERS: Layer[] = ["base", "tall", "wall", "loft"];

/**
 * Rule 8: a gap of 1–299 mm between neighbours, or between a unit and the wall end, a
 * column or a door. Neighbours include units from adjacent walls that reach into this wall's
 * band, so the corner unit on wall A counts as the start of wall B's run.
 */
export function leftoverGapRule(project: Project, cat: Catalogue): CheckResult[] {
  const ctx = getContext(project, cat);
  const results: CheckResult[] = [];
  const seen = new Set<string>();

  for (const frame of ctx.frames) {
    for (const layer of LAYERS) {
      const occ = occupancy(ctx, frame.wallId, layer);
      if (!occ.some((o) => o.own)) continue;

      type Side = Occupant | "start" | "end";
      const gaps: { from: number; to: number; prev: Side; next: Side }[] = [];
      let cursor = 0;
      let prev: Side = "start";
      for (const o of occ) {
        if (o.along[0] > cursor) gaps.push({ from: cursor, to: o.along[0], prev, next: o });
        if (o.along[1] >= cursor) {
          cursor = o.along[1];
          prev = o;
        }
      }
      if (frame.lengthMm > cursor) gaps.push({ from: cursor, to: frame.lengthMm, prev, next: "end" });

      for (const g of gaps) {
        const width = g.to - g.from;
        if (width <= 0 || width >= MIN_USEFUL_GAP_MM) continue;
        const prevOwn = typeof g.prev !== "string" && g.prev.own ? g.prev : undefined;
        const nextOwn = typeof g.next !== "string" && g.next.own ? g.next : undefined;
        if (!prevOwn && !nextOwn) continue;
        const key = `${frame.wallId}:${g.from}:${g.to}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const wall = wallName(frame.wallId);
        const sideLabel = (s: Side) => (typeof s === "string" ? "" : s.label);
        const message =
          g.next === "end"
            ? `${mm(width)} mm gap at the end of ${wall}${LAYER_SUFFIX[layer]}.`
            : g.prev === "start"
              ? `${mm(width)} mm gap at the start of ${wall}${LAYER_SUFFIX[layer]}.`
              : `${mm(width)} mm gap between ${sideLabel(g.prev)} and ${sideLabel(g.next)} on ${wall}${LAYER_SUFFIX[layer]}.`;

        const fixes: Fix[] = [];
        if (width <= FILLER_MAX_MM) {
          fixes.push({
            label: `Add a ${mm(width)} mm filler`,
            action: { type: "addFiller", wallId: frame.wallId, layer, offsetMm: g.from, widthMm: width },
          });
        }
        // A wider catalogue unit on either side, shifted so the run closes exactly.
        const left = ownModule(ctx, prevOwn);
        const right = ownModule(ctx, nextOwn);
        for (const [n, offsetMm] of [
          [left, left?.offsetMm],
          [right, g.from],
        ] as const) {
          if (!n || offsetMm === undefined) continue;
          const wider = moduleInFamily(cat, getModule(cat, n.moduleCode).family, n.widthMm + width);
          if (!wider) continue;
          fixes.push({
            label: `Replace ${n.moduleCode} with ${wider.code}`,
            action: { type: "replaceAndMove", placementId: n.id, moduleCode: wider.code, offsetMm },
          });
        }
        // Or slide a neighbour across to close the gap.
        if (left) {
          fixes.push({
            label: `Move ${left.moduleCode} ${mm(width)} mm right`,
            action: { type: "move", placementId: left.id, wallId: left.wallId, offsetMm: left.offsetMm + width },
          });
        }
        if (right) {
          fixes.push({
            label: `Move ${right.moduleCode} ${mm(width)} mm left`,
            action: { type: "move", placementId: right.id, wallId: right.wallId, offsetMm: g.from },
          });
        }

        results.push({
          ruleId: "leftover-gap",
          group: "fit",
          status: "warning",
          placementIds: [prevOwn?.placementId, nextOwn?.placementId].filter((id): id is string => !!id),
          message,
          fixes,
        });
      }
    }
  }
  return results.length ? results : [pass("leftover-gap", "fit", "No awkward gaps between units")];
}

/**
 * Rule 9: an inside corner where both walls have base units within 1000 mm of the corner
 * and no blind corner unit there has its blind side facing the corner.
 */
export function cornerRule(project: Project, cat: Catalogue): CheckResult[] {
  const ctx = getContext(project, cat);
  const segs = wallSegments(project.room);
  const area = signedArea(project.room);
  const closed = isRoomClosed(project.room);
  const results: CheckResult[] = [];

  for (let i = 0; i < segs.length; i++) {
    if (i === segs.length - 1 && !closed) break;
    const s1 = segs[i];
    const s2 = segs[(i + 1) % segs.length];
    const turn = s1.dir.x * s2.dir.y - s1.dir.y * s2.dir.x;
    if (turn === 0 || Math.sign(turn) !== Math.sign(area)) continue; // not an inside corner

    const corner = s1.end;
    const nearCorner = (wallId: string) => {
      const frame = ctx.frameById.get(wallId)!;
      const cornerOffset = worldToWall(frame, corner).offsetMm;
      return ctx.entries
        .filter((e) => e.slot?.wallId === wallId && e.slot.layer === "base" && !e.isFiller && isModulePlacement(e.placement))
        .map((e) => {
          const { offsetMm: o, widthMm: w } = e.slot!;
          const cornerSide: BlindSide = cornerOffset === 0 ? "left" : "right";
          const dist = cornerSide === "left" ? o : frame.lengthMm - (o + w);
          const blindSide = isModulePlacement(e.placement) ? e.placement.blindSide : undefined;
          return { e, dist, cornerSide, facesCorner: blindSide === cornerSide, wallLength: frame.lengthMm };
        })
        .filter((x) => x.dist < CORNER_REACH_MM)
        .sort((a, b) => a.dist - b.dist);
    };
    const near1 = nearCorner(s1.wallId);
    const near2 = nearCorner(s2.wallId);
    if (!near1.length || !near2.length) continue;

    const blinds = [...near1, ...near2].filter(({ e }) => isModulePlacement(e.placement) && getModule(cat, e.placement.moduleCode).hasBlindSide);
    const facing = blinds.filter((b) => b.facesCorner);
    if (facing.length) continue;

    if (blinds.length) {
      const b = blinds[0];
      const side = b.cornerSide;
      results.push({
        ruleId: "corner",
        group: "fit",
        status: "warning",
        placementIds: [b.e.id],
        message: `${b.e.label} on ${wallName(b.e.slot!.wallId)} has its blind side facing away from the corner. Flip it so the blind section sits in the corner.`,
        fixes: [{ label: `Make the blind side ${side}`, action: { type: "setBlindSide", placementId: b.e.id, blindSide: side } }],
      });
      continue;
    }

    const u1 = near1[0];
    const u2 = near2[0];
    results.push({
      ruleId: "corner",
      group: "fit",
      status: "warning",
      placementIds: [u1.e.id, u2.e.id],
      message: `The corner between ${wallName(s1.wallId)} and ${wallName(s2.wallId)} has no corner solution. Use a BC1000 blind corner unit so the corner space is reachable.`,
      fixes: [u1, u2].map((u) => ({
        label: `Replace ${u.e.label} on ${wallName(u.e.slot!.wallId)} with BC1000 in the corner`,
        action: { type: "replaceAndMove" as const, placementId: u.e.id, moduleCode: "BC1000", offsetMm: u.cornerSide === "left" ? 0 : u.wallLength - 1000 },
      })),
    });
  }
  return results.length ? results : [pass("corner", "fit", "Corners are handled")];
}
