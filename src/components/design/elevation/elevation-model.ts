// What an elevation shows, in wall-local mm: x = offset from the wall's left end (seen from
// inside), z = height above the floor. Derived from the project; no React.

import { catalogue, getAppliance, getModule } from "@/domain/catalogue";
import {
  beamToBox,
  blindRange,
  columnToBox,
  countertopOutline,
  isModulePlacement,
  placementToWallBox,
  placementToWorldBox,
  wallFrames,
  worldBoxToWall,
} from "@/domain/geometry";
import { snapTargets } from "@/domain/snapping";
import type { Catalogue, CatalogueModule, Layer, ModulePlacement, Placement, Project } from "@/domain/types";
import { ZONES } from "@/domain/zones";

export interface ElevUnit {
  id: string;
  placement: Placement;
  /** Module, or null for a free appliance. */
  mod: CatalogueModule | null;
  label: string;
  layer: Layer;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  blind: [number, number] | null;
}

export interface ElevFitted {
  id: string;
  hostId: string;
  applianceId: string;
  label: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface ElevZone {
  key: string;
  kind: "column" | "corner" | "beam";
  label: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface CutOut {
  id: string;
  label: string;
  x0: number;
  x1: number;
}

export interface ElevationModel {
  wallId: string;
  length: number;
  ceiling: number;
  units: ElevUnit[];
  fitted: ElevFitted[];
  zones: ElevZone[];
  beams: { id: string; bottom: number; depth: number }[];
  windows: { id: string; x0: number; x1: number; z0: number; z1: number }[];
  doors: { id: string; x0: number; x1: number; z1: number }[];
  plumbing: { id: string; x: number }[];
  countertop: [number, number][];
  cutOuts: CutOut[];
  /** Dimension chains: sorted offsets from 0 to the wall length. */
  baseChain: number[];
  upperChain: number[];
}

/** Wall-local range a world box covers when it stands against this wall (depth starts at the wall). */
const TOUCH_MM = 50;

function chain(length: number, ranges: [number, number][]): number[] {
  const cuts = new Set<number>([0, length]);
  for (const [a, b] of ranges) {
    if (a > 0 && a < length) cuts.add(Math.round(a));
    if (b > 0 && b < length) cuts.add(Math.round(b));
  }
  return [...cuts].sort((a, b) => a - b);
}

export function elevationModel(project: Project, wallId: string, cat: Catalogue = catalogue): ElevationModel | null {
  const frame = wallFrames(project.room).find((f) => f.wallId === wallId);
  if (!frame) return null;
  const { room } = project;
  const length = frame.lengthMm;
  const ceiling = room.ceilingHeightMm;
  const inRange = (a: number, b: number) => b > 0 && a < length;

  const units: ElevUnit[] = [];
  const zones: ElevZone[] = [];
  const all: Placement[] = [...project.modules, ...project.appliances];
  for (const p of all) {
    if (!isModulePlacement(p) && p.kind === "hosted") continue;
    const own = p.wallId === wallId;
    if (own) {
      let wb;
      try {
        wb = placementToWallBox(project, p, cat).wb;
      } catch {
        continue;
      }
      const mod = isModulePlacement(p) ? getModule(cat, p.moduleCode) : null;
      units.push({
        id: p.id,
        placement: p,
        mod,
        label: isModulePlacement(p) ? p.moduleCode : getAppliance(cat, p.applianceId).name,
        layer: p.layer,
        x0: wb.along[0],
        x1: wb.along[1],
        z0: wb.z[0],
        z1: wb.z[1],
        blind: isModulePlacement(p) ? blindRange(p) : null,
      });
      continue;
    }
    // Units on the adjacent wall that stand against this one: the corner zone.
    let box;
    try {
      box = placementToWorldBox(project, p, cat);
    } catch {
      continue;
    }
    const wb = worldBoxToWall(frame, box);
    if (wb.depth[0] > TOUCH_MM || wb.depth[1] <= 0 || !inRange(wb.along[0], wb.along[1])) continue;
    const label = isModulePlacement(p) ? p.moduleCode : getAppliance(cat, p.applianceId).name;
    zones.push({
      key: `corner-${p.id}`,
      kind: "corner",
      label: `${label} · Wall ${p.wallId}`,
      x0: Math.max(0, wb.along[0]),
      x1: Math.min(length, wb.along[1]),
      z0: wb.z[0],
      z1: wb.z[1],
    });
  }

  const fitted: ElevFitted[] = [];
  for (const a of project.appliances) {
    if (a.kind !== "hosted") continue;
    const host = project.modules.find((m) => m.id === a.hostPlacementId);
    if (!host || host.wallId !== wallId) continue;
    const spec = getAppliance(cat, a.applianceId);
    if (spec.cutOut) continue; // sink and hob show as countertop cut-outs
    const { wb } = placementToWallBox(project, a, cat);
    fitted.push({ id: a.id, hostId: host.id, applianceId: spec.id, label: spec.name, x0: wb.along[0], x1: wb.along[1], z0: wb.z[0], z1: wb.z[1] });
  }

  const beams: ElevationModel["beams"] = [];
  const windows: ElevationModel["windows"] = [];
  const doors: ElevationModel["doors"] = [];
  const plumbing: ElevationModel["plumbing"] = [];
  for (const f of room.features) {
    if (f.kind === "window" && f.wallId === wallId) windows.push({ id: f.id, x0: f.offsetMm, x1: f.offsetMm + f.widthMm, z0: f.sillMm, z1: f.topMm });
    if (f.kind === "door" && f.wallId === wallId) doors.push({ id: f.id, x0: f.offsetMm, x1: f.offsetMm + f.widthMm, z1: f.heightMm });
    if (f.kind === "plumbing" && f.wallId === wallId) plumbing.push({ id: f.id, x: f.offsetMm });
    if (f.kind === "beam") {
      if (f.wallId === wallId) {
        beams.push({ id: f.id, bottom: f.bottomMm, depth: f.depthMm });
        continue;
      }
      // Another wall's beam running into this wall's corner.
      const box = beamToBox(room, f);
      if (!box) continue;
      const wb = worldBoxToWall(frame, box);
      if (wb.depth[0] > TOUCH_MM || !inRange(wb.along[0], wb.along[1])) continue;
      zones.push({
        key: `beam-${f.id}`,
        kind: "beam",
        label: `Beam · Wall ${f.wallId}`,
        x0: Math.max(0, wb.along[0]),
        x1: Math.min(length, wb.along[1]),
        z0: f.bottomMm,
        z1: ceiling,
      });
    }
    if (f.kind === "column") {
      const wb = worldBoxToWall(frame, columnToBox(f, ceiling));
      if (wb.depth[0] > TOUCH_MM || !inRange(wb.along[0], wb.along[1])) continue;
      zones.push({
        key: `column-${f.id}`,
        kind: "column",
        label: `Column ${f.widthMm}`,
        x0: Math.max(0, wb.along[0]),
        x1: Math.min(length, wb.along[1]),
        z0: 0,
        z1: ceiling,
      });
    }
  }

  // Countertop: slabs that start at this wall's face, and the cut-outs on this wall's hosts.
  const outline = countertopOutline(project, cat);
  const countertop: [number, number][] = [];
  for (const slab of outline.slabs) {
    const wb = worldBoxToWall(frame, { ...slab.rect, minZ: 0, maxZ: 1 });
    if (wb.depth[0] > TOUCH_MM || !inRange(wb.along[0], wb.along[1])) continue;
    countertop.push([Math.max(0, wb.along[0]), Math.min(length, wb.along[1])]);
  }
  const cutOuts: CutOut[] = [];
  for (const c of outline.cutOuts) {
    const host = project.appliances.find((a) => a.id === c.placementId);
    const hostUnit = host?.kind === "hosted" ? project.modules.find((m) => m.id === host.hostPlacementId) : undefined;
    if (!hostUnit || hostUnit.wallId !== wallId) continue;
    const spec = getAppliance(cat, c.applianceId).cutOut!;
    const wb = worldBoxToWall(frame, { ...c.rect, minZ: 0, maxZ: 1 });
    cutOuts.push({ id: c.placementId, label: `${c.applianceId === "hob" ? "Hob" : "Sink"} cut-out|${spec.widthMm} × ${spec.depthMm}`, x0: wb.along[0], x1: wb.along[1] });
  }

  const baseOcc = snapTargets(project, cat, wallId, "base").occupied;
  const upperOcc = snapTargets(project, cat, wallId, "wall").occupied;
  const hasUpper = units.some((u) => u.layer === "wall");

  return {
    wallId,
    length,
    ceiling,
    units,
    fitted,
    zones,
    beams,
    windows,
    doors,
    plumbing,
    countertop,
    cutOuts,
    baseChain: chain(length, baseOcc),
    upperChain: hasUpper ? chain(length, upperOcc) : [],
  };
}

/** Vertical band a layer occupies, for ghosts. Lofts take the module's height. */
export function layerBand(layer: Layer, heightMm: number): [number, number] {
  switch (layer) {
    case "base":
      return [ZONES.plinth.bottom, ZONES.baseCarcass.top];
    case "wall":
      return [ZONES.wall.bottom, ZONES.wall.top];
    case "loft":
      return [ZONES.loft.bottom, ZONES.loft.bottom + heightMm];
    case "tall":
      return [ZONES.tall.bottom, ZONES.tall.top];
  }
}

/** Height used for a unit of this module in its layer (fillers take the layer's height). */
export function unitHeight(p: Pick<ModulePlacement, "moduleCode" | "layer">, cat: Catalogue = catalogue): number {
  const mod = getModule(cat, p.moduleCode);
  if (mod.family !== "FIL") return mod.heightMm;
  return p.layer === "loft" ? 400 : p.layer === "tall" ? 2100 : 720;
}
