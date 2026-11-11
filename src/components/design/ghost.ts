// Building drag ghosts: snap, fast check and neighbour distances for a candidate position.

import { catalogue, getModule } from "@/domain/catalogue";
import { defaultBlindSide } from "@/domain/geometry";
import { checkPlacementFast } from "@/domain/rules";
import { neighbourGaps, snapOffset, snapTargets, type SnapKind, type SnapTargets } from "@/domain/snapping";
import type { ModulePlacement, Project } from "@/domain/types";
import { projectStore } from "@/store/project-store";
import { GHOST_ID, type DragItem, type Ghost } from "./interaction";

/** The unit a drag item would place on `wallId` (offset still to be set). */
export function dragPlacement(project: Project, item: DragItem, wallId: string): ModulePlacement | null {
  if (item.kind === "new") {
    const mod = getModule(catalogue, item.moduleCode);
    if (mod.layer === "any") return null;
    return {
      id: GHOST_ID,
      moduleCode: mod.code,
      wallId,
      layer: mod.layer,
      offsetMm: 0,
      widthMm: mod.widthMm,
      carcassId: catalogue.carcasses[0].id,
      ...projectStore.getState().finishFor(mod.code),
      hardware: [],
      isCustomSize: false,
    };
  }
  const p = project.modules.find((m) => m.id === item.placementId);
  return p ? { ...p } : null;
}

/** Snap targets per (project, wall, layer, dragged unit), reused across animation frames. */
const targetCache = new WeakMap<Project, Map<string, SnapTargets>>();
export function cachedTargets(project: Project, wallId: string, p: ModulePlacement): SnapTargets {
  let byKey = targetCache.get(project);
  if (!byKey) targetCache.set(project, (byKey = new Map()));
  const key = `${wallId}|${p.layer}|${p.id}`;
  let t = byKey.get(key);
  if (!t) byKey.set(key, (t = snapTargets(project, catalogue, wallId, p.layer, p.id)));
  return t;
}

/** A ghost at an exact offset (no snapping): used for keyboard nudges and after snapping. */
export function ghostAt(project: Project, item: DragItem, base: ModulePlacement, offsetMm: number, snap: SnapKind = "grid"): Ghost {
  const candidate: ModulePlacement = { ...base, offsetMm };
  if (getModule(catalogue, base.moduleCode).hasBlindSide && item.kind === "new") {
    candidate.blindSide = defaultBlindSide(project.room, base.wallId, offsetMm, base.widthMm);
  }
  const fast = checkPlacementFast(project, catalogue, candidate);
  return {
    item,
    candidate,
    status: fast.status,
    reason: fast.reason,
    gaps: neighbourGaps(offsetMm, base.widthMm, cachedTargets(project, base.wallId, base)),
    snap,
  };
}

/** A ghost for a raw (unsnapped) offset, snapped to neighbours, run ends and features within `thresholdMm`. */
export function snappedGhost(project: Project, item: DragItem, base: ModulePlacement, rawOffset: number, thresholdMm: number, magnets: boolean): Ghost {
  const snap = snapOffset(rawOffset, base.widthMm, cachedTargets(project, base.wallId, base), thresholdMm, magnets);
  return ghostAt(project, item, base, snap.offsetMm, snap.kind);
}
