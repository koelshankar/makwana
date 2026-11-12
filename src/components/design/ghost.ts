// Building drag ghosts: snap, fast check and neighbour distances for a candidate position.
// A ghost carries a unit, a free appliance, or a fitted-type appliance (sink, hob, oven,
// microwave), which snaps into a valid host under the pointer or is shown loose (blocked).

import { catalogue, getAppliance, getModule } from "@/domain/catalogue";
import { defaultBlindSide, findPlacement, isModulePlacement, LAYER_DEPTH_MM, placementToWallBox, placementToWorldBox, wallBoxToWorld, wallFrame, type WallSlot } from "@/domain/geometry";
import { checkPlacementFast } from "@/domain/rules";
import { freeHosts, hostModuleFor } from "@/domain/rules/appliance";
import { neighbourGaps, snapOffset, snapTargets, type SnapKind, type SnapTargets } from "@/domain/snapping";
import type { Box, FreeAppliancePlacement, Layer, ModulePlacement, Placement, Project } from "@/domain/types";
import { projectStore } from "@/store/project-store";
import { layerBand, unitHeight } from "./elevation/elevation-model";
import { GHOST_ID, type DragItem, type Ghost } from "./interaction";

/** A unit or a free appliance: something with its own place on a wall. */
export type WallPlaced = ModulePlacement | FreeAppliancePlacement;

export const widthOf = (p: WallPlaced) => (isModulePlacement(p) ? p.widthMm : getAppliance(catalogue, p.applianceId).widthMm);
export const labelOf = (p: Placement) => (isModulePlacement(p) ? p.moduleCode : getAppliance(catalogue, p.applianceId).name);

/** What a drag item would place on `wallId` (offset still to be set). Fitted-type appliances start loose. */
export function dragPlacement(project: Project, item: DragItem, wallId: string): WallPlaced | null {
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
  if (item.kind === "newAppliance") {
    const spec = getAppliance(catalogue, item.applianceId);
    return { kind: "free", id: GHOST_ID, applianceId: spec.id, wallId, layer: spec.layer, offsetMm: 0 };
  }
  const p = findPlacement(project, item.placementId);
  if (!p || (!isModulePlacement(p) && p.kind !== "free")) return null;
  return { ...p };
}

/** Snap targets per (project, wall, layer, dragged item), reused across animation frames. */
const targetCache = new WeakMap<Project, Map<string, SnapTargets>>();
export function cachedTargets(project: Project, wallId: string, layer: Layer, id: string): SnapTargets {
  let byKey = targetCache.get(project);
  if (!byKey) targetCache.set(project, (byKey = new Map()));
  const key = `${wallId}|${layer}|${id}`;
  let t = byKey.get(key);
  if (!t) byKey.set(key, (t = snapTargets(project, catalogue, wallId, layer, id)));
  return t;
}

/** Height band a ghost shows in: the unit's, the host's for fitted appliances, the appliance's own for free ones. */
function ghostZ(project: Project, c: Placement): [number, number] {
  if (isModulePlacement(c)) return layerBand(c.layer, unitHeight(c));
  if (c.kind === "hosted") {
    const host = project.modules.find((m) => m.id === c.hostPlacementId);
    return host ? layerBand(host.layer, unitHeight(host)) : [0, 0];
  }
  const spec = getAppliance(catalogue, c.applianceId);
  if (spec.hosted) return layerBand(spec.layer, 720);
  return placementToWallBox(project, c, catalogue).wb.z;
}

function finish(project: Project, item: DragItem, candidate: Placement, slot: WallSlot, gaps: Ghost["gaps"], snap: Ghost["snap"]): Ghost {
  const fast = checkPlacementFast(project, catalogue, candidate);
  return { item, candidate, slot, z: ghostZ(project, candidate), label: labelOf(candidate), status: fast.status, reason: fast.reason, gaps, snap };
}

/** A ghost at an exact offset (no snapping): used for keyboard nudges and after snapping. */
export function ghostAt(project: Project, item: DragItem, base: WallPlaced, offsetMm: number, snap: SnapKind = "grid"): Ghost {
  const candidate: WallPlaced = { ...base, offsetMm };
  if (isModulePlacement(candidate) && getModule(catalogue, candidate.moduleCode).hasBlindSide && item.kind === "new") {
    candidate.blindSide = defaultBlindSide(project.room, candidate.wallId, offsetMm, candidate.widthMm);
  }
  const widthMm = widthOf(base);
  const slot = { wallId: base.wallId, layer: base.layer, offsetMm, widthMm };
  return finish(project, item, candidate, slot, neighbourGaps(offsetMm, widthMm, cachedTargets(project, base.wallId, base.layer, base.id)), snap);
}

/** Units on `wallId` that can take this appliance now. */
export function validHosts(project: Project, wallId: string, applianceId: string): ModulePlacement[] {
  return freeHosts(project, catalogue, applianceId).filter((h) => h.wallId === wallId);
}

/** The appliance fitted into `host`. */
function hostGhost(project: Project, item: DragItem, applianceId: string, host: ModulePlacement): Ghost {
  const candidate: Placement = { kind: "hosted", id: GHOST_ID, applianceId, hostPlacementId: host.id };
  const slot = { wallId: host.wallId, layer: host.layer, offsetMm: host.offsetMm, widthMm: host.widthMm };
  return finish(project, item, candidate, slot, { left: null, right: null }, "host");
}

/**
 * A ghost for a raw (unsnapped) offset, snapped to neighbours, run ends and features within
 * `thresholdMm`. A fitted-type appliance snaps into a host of the right type under the pointer instead.
 */
export function snappedGhost(project: Project, item: DragItem, base: WallPlaced, rawOffset: number, thresholdMm: number, magnets: boolean): Ghost {
  const width = widthOf(base);
  if (!isModulePlacement(base) && getAppliance(catalogue, base.applianceId).hosted) {
    const centre = rawOffset + width / 2;
    // Any unit of the right type catches it, so a full one says why ("already has an oven").
    const host = project.modules
      .filter((m) => m.wallId === base.wallId && getModule(catalogue, m.moduleCode).hosts?.includes(base.applianceId))
      .find((h) => centre >= h.offsetMm - thresholdMm && centre <= h.offsetMm + h.widthMm + thresholdMm);
    if (host) return hostGhost(project, item, base.applianceId, host);
  }
  const snap = snapOffset(rawOffset, width, cachedTargets(project, base.wallId, base.layer, base.id), thresholdMm, magnets);
  return ghostAt(project, item, base, snap.offsetMm, snap.kind);
}

/** The ghost's box in world mm, for the 3D view. A loose sink shows the size of the unit it needs. */
export function ghostWorldBox(project: Project, g: Ghost): Box | null {
  const c = g.candidate;
  try {
    if (isModulePlacement(c)) return placementToWorldBox(project, c, catalogue);
    if (c.kind === "hosted") {
      const host = project.modules.find((m) => m.id === c.hostPlacementId);
      return host ? placementToWorldBox(project, host, catalogue) : null;
    }
    const spec = getAppliance(catalogue, c.applianceId);
    if (!spec.hosted) return placementToWorldBox(project, c, catalogue);
    const depth = hostModuleFor(catalogue, spec.id)?.depthMm ?? LAYER_DEPTH_MM[g.slot.layer];
    return wallBoxToWorld(wallFrame(project.room, g.slot.wallId), { along: [g.slot.offsetMm, g.slot.offsetMm + g.slot.widthMm], depth: [0, depth], z: g.z });
  } catch {
    return null;
  }
}
