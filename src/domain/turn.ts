// Turning a unit to face another wall (Feedback 1, item 2). Pure.
//
// A unit always stands with its back to a wall and faces into the room, so the wall it faces
// from is its wall: turning it is moving it to another wall, a quarter turn (or half) about the
// vertical. The model stays { wallId, layer, offsetMm }: no free angles. R, Shift+R, the
// inspector's Wall picker and the Move button all use this, through wallsUnitFits and turnedTo.

import { getAppliance, getModule } from "./catalogue";
import { defaultBlindSide, findPlacement, isModulePlacement, placementToWorldBox, solidWalls, wallFrame, worldToWall } from "./geometry";
import { checkPlacementFast } from "./rules";
import { snapTargets } from "./snapping";
import type { Catalogue, CheckResult, FixAction, FreeAppliancePlacement, ModulePlacement, Project } from "./types";

/** Something with its own place on a wall: a unit or a free appliance (chimney, dishwasher, fridge space). */
export type Turnable = ModulePlacement | FreeAppliancePlacement;

export const turnWidth = (p: Turnable, cat: Catalogue) => (isModulePlacement(p) ? p.widthMm : getAppliance(cat, p.applianceId).widthMm);

/**
 * What turns when `id` is selected: the unit or free appliance itself, or a fitted appliance's
 * host unit (a sink turns with its sink unit). Null if there's nothing on a wall to turn.
 */
export function turnSubject(project: Project, id: string): Turnable | null {
  const p = findPlacement(project, id);
  if (!p) return null;
  if (isModulePlacement(p) || p.kind === "free") return p;
  return project.modules.find((m) => m.id === p.hostPlacementId) ?? null;
}

/**
 * The one fit check for moving a unit to another wall: the standing walls (open segments never
 * count) that have at least one spot where the unit isn't blocked, in chain order. "Not blocked"
 * is checkPlacementFast, the placement rules every drop and turn runs: inside the wall, no overlap
 * in the unit's height band (units on this wall and round the corners, columns, doors), clear of
 * windows, beams and the ceiling. The unit's own wall always counts.
 *
 * R / Shift+R (nextWall), the Wall picker, the Move button and turnPlacement all use this list.
 */
export function wallsUnitFits(project: Project, cat: Catalogue, p: Turnable): string[] {
  const w = turnWidth(p, cat);
  return solidWalls(project.room)
    .filter(
      (wall) =>
        wall.id === p.wallId ||
        (wall.lengthMm >= w && nearestFreeOffset(project, cat, p, wall.id, turnedTo(project, cat, p, wall.id).offsetMm) !== null),
    )
    .map((wall) => wall.id);
}

/**
 * The next (1) or previous (-1) wall after `fromWallId` in A→Z order, wrapping round, among the
 * walls the unit fits on. Null when no other wall fits.
 */
export function nextWall(project: Project, cat: Catalogue, p: Turnable, fromWallId: string, dir: 1 | -1): string | null {
  const fits = wallsUnitFits(project, cat, p);
  const order = solidWalls(project.room).map((w) => w.id);
  const at = order.indexOf(fromWallId);
  for (let k = 1; k <= order.length; k++) {
    const id = order[(((at + dir * k) % order.length) + order.length) % order.length];
    if (id !== fromWallId && fits.includes(id)) return id;
  }
  return null;
}

/**
 * The unit on `wallId`, at its footprint centre projected onto that wall and kept within the
 * wall. Turning a unit next to a corner onto the wall across that corner keeps it at the corner.
 * A blind corner unit takes the blind side facing the nearer end of its new wall.
 */
export function turnedTo(project: Project, cat: Catalogue, p: Turnable, wallId: string): Turnable {
  const box = placementToWorldBox(project, p, cat);
  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const frame = wallFrame(project.room, wallId);
  const w = turnWidth(p, cat);
  const along = worldToWall(frame, centre).offsetMm;
  const offsetMm = Math.max(0, Math.min(frame.lengthMm - w, Math.round(along - w / 2)));
  const moved: Turnable = { ...p, wallId, offsetMm };
  if (isModulePlacement(moved) && getModule(cat, moved.moduleCode).hasBlindSide) {
    moved.blindSide = defaultBlindSide(project.room, wallId, offsetMm, w);
  }
  return moved;
}

/**
 * The free offset on `wallId` nearest to `preferred`, or null if none. It tries 10 mm steps, the
 * far end, and flush against each thing already in the unit's band on that wall, so a gap exactly
 * as wide as the unit is found even when it doesn't start on a 10 mm step.
 */
export function nearestFreeOffset(project: Project, cat: Catalogue, p: Turnable, wallId: string, preferred: number): number | null {
  const wall = solidWalls(project.room).find((x) => x.id === wallId);
  const w = turnWidth(p, cat);
  if (!wall || wall.lengthMm < w) return null;
  const max = wall.lengthMm - w;
  const candidates = new Set<number>([max]);
  for (let o = 0; o <= max; o += 10) candidates.add(o);
  for (const [a0, a1] of snapTargets(project, cat, wallId, p.layer, p.id).occupied) {
    for (const o of [Math.round(a1), Math.round(a0 - w)]) if (o >= 0 && o <= max) candidates.add(o);
  }
  const sorted = [...candidates].sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b);
  for (const offsetMm of sorted) {
    if (checkPlacementFast(project, cat, { ...p, wallId, offsetMm }).status === "pass") return offsetMm;
  }
  return null;
}

/** The first fix on the Blocked card after a blocked turn. */
export const nearestFreeLabel = (wallId: string) => `Move to nearest free spot on Wall ${wallId}`;

/**
 * Puts "Move to nearest free spot on Wall X" first on every blocked result of a blocked turn (and
 * drops any other fix that does the same move), so the Blocked card leads with it. Unchanged when
 * the wall has no free spot.
 */
export function withNearestFreeFix(project: Project, cat: Catalogue, turned: Turnable, results: CheckResult[]): CheckResult[] {
  const offsetMm = nearestFreeOffset(project, cat, turned, turned.wallId, turned.offsetMm);
  if (offsetMm === null) return results;
  const action: FixAction = { type: "move", placementId: turned.id, wallId: turned.wallId, offsetMm };
  const same = (a: FixAction) => a.type === "move" && a.wallId === action.wallId && a.offsetMm === action.offsetMm;
  return results.map((r) =>
    r.status === "blocked" ? { ...r, fixes: [{ label: nearestFreeLabel(turned.wallId), action }, ...r.fixes.filter((f) => !same(f.action))] } : r,
  );
}
