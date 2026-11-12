// Shared, precomputed geometry for one rules run. Built once per (project, catalogue) pair.

import { getAppliance, getModule } from "../catalogue";
import {
  boxesIntersect,
  columnToBox,
  findPlacement,
  isModulePlacement,
  placementSlot,
  placementToWallBox,
  rangesOverlap,
  wallBoxToWorld,
  wallFrames,
  worldBoxToWall,
  type WallBox,
  type WallFrame,
  type WallSlot,
} from "../geometry";
import type {
  Box,
  Catalogue,
  CheckGroup,
  CheckResult,
  ColumnFeature,
  DoorFeature,
  Fix,
  Layer,
  Placement,
  Project,
  WindowFeature,
} from "../types";
import { COUNTERTOP_DEPTH_MM, ZONES } from "../zones";

export interface Entry {
  placement: Placement;
  id: string;
  label: string; // module code or appliance name
  slot: WallSlot | null; // null for hosted appliances
  wallId: string | null;
  wb: WallBox | null; // box in its own wall's frame
  box: Box | null; // world box; null if the wall or host is missing
  /** Fitted in a unit, or a fitted-type appliance placed loose: takes no space on the wall. */
  hosted: boolean;
  isFiller: boolean;
}

export interface RuleContext {
  project: Project;
  cat: Catalogue;
  frames: WallFrame[];
  frameById: Map<string, WallFrame>;
  entries: Entry[];
  entryById: Map<string, Entry>;
  columns: { feature: ColumnFeature; box: Box }[];
  doors: { feature: DoorFeature; box: Box }[];
  windows: WindowFeature[];
}

/** Door clearance: the opening, 600 mm into the room, full door height. */
const DOOR_CLEARANCE_MM = COUNTERTOP_DEPTH_MM;

const cache = new WeakMap<Project, WeakMap<Catalogue, RuleContext>>();

export function getContext(project: Project, cat: Catalogue): RuleContext {
  let byCat = cache.get(project);
  if (!byCat) {
    byCat = new WeakMap();
    cache.set(project, byCat);
  }
  let ctx = byCat.get(cat);
  if (!ctx) {
    ctx = buildContext(project, cat);
    byCat.set(cat, ctx);
  }
  return ctx;
}

function buildContext(project: Project, cat: Catalogue): RuleContext {
  const frames = wallFrames(project.room);
  const frameById = new Map(frames.map((f) => [f.wallId, f]));

  const entries: Entry[] = [...project.modules, ...project.appliances].map((placement) => {
    const isModule = isModulePlacement(placement);
    const label = isModule ? placement.moduleCode : getAppliance(cat, placement.applianceId).name;
    const slot = placementSlot(placement, cat);
    let wallId: string | null = null;
    let wb: WallBox | null = null;
    let box: Box | null = null;
    try {
      const local = placementToWallBox(project, placement, cat);
      wallId = local.wallId;
      wb = local.wb;
      const frame = frameById.get(local.wallId);
      if (frame) box = wallBoxToWorld(frame, local.wb);
    } catch {
      // Missing host: reported by the appliance-host rule.
    }
    return {
      placement,
      id: placement.id,
      label,
      slot,
      wallId,
      wb,
      box,
      // A sink or oven dropped loose (not in a unit) takes no space: only the host rule reports it.
      hosted: !isModule && (placement.kind === "hosted" || getAppliance(cat, placement.applianceId).hosted),
      isFiller: isModule && getModule(cat, placement.moduleCode).family === "FIL",
    };
  });

  const columns = project.room.features
    .filter((f): f is ColumnFeature => f.kind === "column")
    .map((feature) => ({ feature, box: columnToBox(feature, project.room.ceilingHeightMm) }));

  const doors = project.room.features
    .filter((f): f is DoorFeature => f.kind === "door")
    .flatMap((feature) => {
      const frame = frameById.get(feature.wallId);
      if (!frame) return [];
      const box = wallBoxToWorld(frame, {
        along: [feature.offsetMm, feature.offsetMm + feature.widthMm],
        depth: [0, DOOR_CLEARANCE_MM],
        z: [0, feature.heightMm],
      });
      return [{ feature, box }];
    });

  const windows = project.room.features.filter((f): f is WindowFeature => f.kind === "window");

  return {
    project,
    cat,
    frames,
    frameById,
    entries,
    entryById: new Map(entries.map((e) => [e.id, e])),
    columns,
    doors,
    windows,
  };
}

// ---------------------------------------------------------------------------
// Layer bands: the space in front of a wall that a layer occupies.

export const LAYER_BANDS: Record<Layer, { depth: [number, number]; z: [number, number] }> = {
  base: { depth: [0, 560], z: [ZONES.plinth.bottom, ZONES.baseCarcass.top] },
  wall: { depth: [0, 350], z: [ZONES.wall.bottom, ZONES.wall.top] },
  loft: { depth: [0, 350], z: [ZONES.loft.bottom, ZONES.loft.bottom + 400] },
  tall: { depth: [0, 560], z: [ZONES.tall.bottom, ZONES.tall.top] },
};

export interface Occupant {
  along: [number, number];
  placementId?: string;
  /** True when this is a placement on this wall in this layer. */
  own: boolean;
  label: string;
  kind: "placement" | "column" | "door";
}

/**
 * Everything that takes up along-wall space in a layer band in front of a wall: placements
 * from any wall (so corners just work), columns and doors. Sorted by start.
 */
export function occupancy(ctx: RuleContext, wallId: string, layer: Layer, excludeId?: string): Occupant[] {
  const frame = ctx.frameById.get(wallId);
  if (!frame) return [];
  const band = LAYER_BANDS[layer];
  const out: Occupant[] = [];

  const consider = (box: Box, occ: Omit<Occupant, "along">) => {
    const wb = worldBoxToWall(frame, box);
    if (!rangesOverlap(wb.depth, band.depth) || !rangesOverlap(wb.z, band.z)) return;
    const a0 = Math.max(0, wb.along[0]);
    const a1 = Math.min(frame.lengthMm, wb.along[1]);
    if (a1 <= a0) return;
    out.push({ ...occ, along: [a0, a1] });
  };

  for (const e of ctx.entries) {
    if (e.hosted || !e.box || e.id === excludeId) continue;
    consider(e.box, {
      placementId: e.id,
      own: e.slot?.wallId === wallId && e.slot.layer === layer,
      label: e.label,
      kind: "placement",
    });
  }
  for (const c of ctx.columns) consider(c.box, { own: false, label: "column", kind: "column" });
  for (const d of ctx.doors) consider(d.box, { own: false, label: "door", kind: "door" });

  return out.sort((a, b) => a.along[0] - b.along[0] || a.along[1] - b.along[1]);
}

// ---------------------------------------------------------------------------
// Result helpers

/** `fixes: false` skips fix generation, for the fast check used while dragging. */
export interface RuleOptions {
  fixes?: boolean;
}

export const propose = (opts: RuleOptions, make: () => Fix[]): Fix[] => (opts.fixes === false ? [] : make());

export function pass(ruleId: string, group: CheckGroup, message: string): CheckResult {
  return { ruleId, group, status: "pass", placementIds: [], message, fixes: [] };
}

export function wallName(wallId: string) {
  return `Wall ${wallId}`;
}

export const mm = (n: number) => `${Math.round(n)}`;

/** Readable name for a placement's kind, for messages. */
export function kindLabel(ctx: RuleContext, id: string): string {
  const p = findPlacement(ctx.project, id);
  if (!p) return "Unit";
  if (!isModulePlacement(p)) return getAppliance(ctx.cat, p.applianceId).name;
  const mod = getModule(ctx.cat, p.moduleCode);
  if (mod.family === "FIL") return "Filler";
  return { base: "Base unit", wall: "Wall unit", loft: "Loft", tall: "Tall unit" }[p.layer];
}

/**
 * Proposed move fixes for a placement: the nearest positions on each of `wallIds` that are
 * clear of other units in the same layer band, and of windows/doors where relevant. These
 * are only proposals; the engine keeps the nearest one per wall that is actually safe.
 */
export function moveProposals(ctx: RuleContext, placementId: string, wallIds: string[]): Fix[] {
  const entry = ctx.entryById.get(placementId);
  if (!entry?.slot) return [];
  const { layer, widthMm: w, offsetMm: current, wallId: currentWall } = entry.slot;
  const fixes: Fix[] = [];

  for (const wallId of wallIds) {
    const frame = ctx.frameById.get(wallId);
    if (!frame || frame.lengthMm < w) continue;
    const occ = occupancy(ctx, wallId, layer, placementId).map((o) => o.along);
    const blockers = [...occ];
    if (layer !== "base") {
      for (const win of ctx.windows) {
        if (win.wallId === wallId) blockers.push([win.offsetMm, win.offsetMm + win.widthMm]);
      }
    }

    const candidates = new Set<number>([0, frame.lengthMm - w]);
    for (const [a0, a1] of blockers) {
      candidates.add(a1);
      candidates.add(a0 - w);
    }
    const valid = [...candidates]
      .filter((o) => o >= 0 && o + w <= frame.lengthMm)
      .filter((o) => !(wallId === currentWall && o === current))
      .filter((o) => !blockers.some((b) => rangesOverlap(b, [o, o + w])))
      .sort((a, b) => (wallId === currentWall ? Math.abs(a - current) - Math.abs(b - current) : a - b));

    for (const o of valid) {
      fixes.push({
        label: `Move to ${wallName(wallId)}, ${mm(o)}–${mm(o + w)} mm`,
        action: { type: "move", placementId, wallId, offsetMm: o },
      });
    }
  }
  return fixes;
}

export function boxesOverlap(a: Box | null, b: Box | null): boolean {
  return !!a && !!b && boxesIntersect(a, b);
}

export function nextWallId(ctx: RuleContext, wallId: string): string | undefined {
  const i = ctx.frames.findIndex((f) => f.wallId === wallId);
  if (i < 0 || ctx.frames.length < 2) return undefined;
  return ctx.frames[(i + 1) % ctx.frames.length].wallId;
}
