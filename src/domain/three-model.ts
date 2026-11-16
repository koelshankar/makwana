// Level 1 3D scene described as plain boxes and panels in millimetres. No React, no three:
// the 3D components only turn these into meshes.
//
// Cabinets and appliances are described in unit-local mm (`along` from the unit's left edge,
// `depth` from the wall into the room, `z` up from the floor) together with a placement
// transform, so identical units share one geometry. Room parts are in world mm.

import { getAppliance, getModule } from "./catalogue";
import {
  blindRange,
  countertopOutline,
  isChainClosed,
  LAYER_DEPTH_MM,
  roomOutline,
  roomVertices,
  wallBoxToWorld,
  wallFrames,
  wallSegments,
  wallToWorld,
  type WallBox,
  type WallFrame,
} from "./geometry";
import type { Appliance, Box, Catalogue, CatalogueModule, Layer, ModulePlacement, Point, Project, Rect, Room } from "./types";
import { COUNTERTOP_DEPTH_MM, FITTED_BOTTOM_MM, WALL_THICKNESS_MM, ZONES } from "./zones";

// ---------------------------------------------------------------------------
// Parts

/** Material roles. Finishes are keyed by finish id so textures can replace colours later. */
export type MaterialKey =
  | "carcass"
  | "plinth"
  | "handle"
  | "groove"
  | "glass"
  | "steel"
  | "burner"
  | "countertop"
  | "wall"
  | "floor"
  | "pane"
  | "frame"
  | `finish:${string}`;

export const finishMaterial = (finishId: string): MaterialKey => `finish:${finishId}`;

export interface BoxPart {
  kind: "box";
  key: string;
  box: WallBox;
  material: MaterialKey;
  /** Draw thin dark edge lines around it. */
  edges?: boolean;
}

/** A box whose top face is narrower: a chimney hood. `box` is the bottom footprint and height. */
export interface TaperPart {
  kind: "taper";
  key: string;
  box: WallBox;
  top: { along: [number, number]; depth: [number, number] };
  material: MaterialKey;
  edges?: boolean;
}

/** A flat ring lying on a horizontal surface: a burner. */
export interface RingPart {
  kind: "ring";
  key: string;
  centre: { along: number; depth: number; z: number };
  radiusMm: number;
  material: MaterialKey;
}

/** A dashed wireframe box with a label and no fill: space reserved for something not supplied. */
export interface OutlinePart {
  kind: "outline";
  key: string;
  box: WallBox;
  label: string;
}

export type Part = BoxPart | TaperPart | RingPart | OutlinePart;

/** Where a unit's local origin sits: its left edge at the wall face, facing into the room. */
export interface UnitTransform {
  origin: Point;
  u: Point;
  n: Point;
}

export function unitTransform(frame: WallFrame, offsetMm: number): UnitTransform {
  return { origin: wallToWorld(frame, offsetMm, 0), u: frame.u, n: frame.n };
}

/** World box of a unit-local box. */
export function partToWorld(t: UnitTransform, wb: WallBox): Box {
  return wallBoxToWorld({ wallId: "", index: 0, origin: t.origin, u: t.u, n: t.n, lengthMm: 0 }, wb);
}

// ---------------------------------------------------------------------------
// Fronts

export const SHUTTER_MM = 18;
export const REVEAL_MM = 3;
export const PLINTH_SETBACK_MM = 50;
export const GROOVE_MM = 15;
const HANDLE_MM = 12;
const HANDLE_LEN_MM = 160;
const HANDLE_INSET_MM = 40;
/** Stacked doors on a tall pantry meet at this height. */
const PANTRY_SPLIT_MM = 1100;

export type FrontKind = "door" | "drawer" | "glass" | "panel" | "blind";

export interface Front {
  kind: FrontKind;
  /** Unit-local, before the reveal is taken off. */
  along: [number, number];
  z: [number, number];
  /** Handle bar position on the front, or null (glass, panels, blind sections). */
  handle: { along: [number, number]; z: [number, number] } | null;
  /** Edge a handleless groove runs along, or null. */
  grooveEdge: "top" | "bottom" | null;
  /** For glass fronts: the housed appliance. */
  appliance?: string;
}

/** Height band of a unit's body, above the plinth for base and tall units. */
export function bodyBand(mod: CatalogueModule, layer: Layer): [number, number] {
  switch (layer) {
    case "base":
      return [ZONES.baseCarcass.bottom, ZONES.baseCarcass.top];
    case "wall":
      return [ZONES.wall.bottom, ZONES.wall.top];
    case "loft":
      return [ZONES.loft.bottom, ZONES.loft.bottom + (mod.family === "FIL" ? 400 : mod.heightMm)];
    case "tall":
      return [ZONES.plinth.top, ZONES.tall.top];
  }
}

const split = ([a, b]: [number, number], n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [Math.round(a + ((b - a) * i) / n), Math.round(a + ((b - a) * (i + 1)) / n)]);

const isUpper = (layer: Layer) => layer === "wall" || layer === "loft";

/** Vertical bar near a door's opening edge: at the top of low doors, the bottom of high ones. */
function doorHandle(along: [number, number], z: [number, number], opening: "left" | "right", atTop: boolean): Front["handle"] {
  const a = opening === "left" ? along[0] + HANDLE_INSET_MM : along[1] - HANDLE_INSET_MM - HANDLE_MM;
  const zr: [number, number] = atTop ? [z[1] - HANDLE_INSET_MM - HANDLE_LEN_MM, z[1] - HANDLE_INSET_MM] : [z[0] + HANDLE_INSET_MM, z[0] + HANDLE_INSET_MM + HANDLE_LEN_MM];
  return { along: [a, a + HANDLE_MM], z: zr };
}

/** Horizontal bar across the top (drawers) or bottom (wall units and lofts) of a front. */
function barHandle(along: [number, number], z: [number, number], edge: "top" | "bottom"): Front["handle"] {
  const zr: [number, number] = edge === "top" ? [z[1] - 30 - HANDLE_MM, z[1] - 30] : [z[0] + 30, z[0] + 30 + HANDLE_MM];
  return { along: [along[0] + HANDLE_INSET_MM, along[1] - HANDLE_INSET_MM], z: zr };
}

/** Doors side by side: 600 mm and wider get two, meeting in the middle. */
function doors(along: [number, number], z: [number, number], layer: Layer, opening: "left" | "right" = "right"): Front[] {
  const upper = isUpper(layer);
  const edge = upper ? "bottom" : "top";
  const handle = (a: [number, number], side: "left" | "right") =>
    upper ? barHandle(a, z, "bottom") : doorHandle(a, z, side, true);
  if (along[1] - along[0] < 600) return [{ kind: "door", along, z, handle: handle(along, opening), grooveEdge: edge }];
  const [l, r] = split(along, 2);
  return [
    { kind: "door", along: l, z, handle: handle(l, "right"), grooveEdge: edge },
    { kind: "door", along: r, z, handle: handle(r, "left"), grooveEdge: edge },
  ];
}

function drawers(along: [number, number], z: [number, number], n: number): Front[] {
  return split(z, n)
    .reverse()
    .map((zr) => ({ kind: "drawer" as const, along, z: zr, handle: barHandle(along, zr, "top"), grooveEdge: "top" as const }));
}

/**
 * Front divisions of a unit, from its module type. `hosted` lists the appliance ids fitted in
 * it, so a tall housing shows glass fronts where the oven and microwave are.
 */
export function frontDivisions(p: ModulePlacement, cat: Catalogue, hosted: readonly string[] = []): Front[] {
  const mod = getModule(cat, p.moduleCode);
  const w = p.widthMm;
  const z = bodyBand(mod, p.layer);
  const full: [number, number] = [0, w];

  switch (mod.family) {
    case "FIL":
      return [{ kind: "panel", along: full, z, handle: null, grooveEdge: null }];
    case "BD":
      return drawers(full, z, 2);
    case "HU":
      return drawers(full, z, 3);
    case "BC": {
      const blind = blindRange(p);
      if (!blind) return doors(full, z, p.layer);
      const b: [number, number] = [blind[0] - p.offsetMm, blind[1] - p.offsetMm];
      const open: [number, number] = b[0] === 0 ? [b[1], w] : [0, b[0]];
      // The door opens away from the blind side.
      const opening = b[0] === 0 ? "right" : "left";
      const blindFront: Front = { kind: "blind", along: b, z, handle: null, grooveEdge: null };
      return [blindFront, ...doors(open, z, p.layer, opening)].sort((x, y) => x.along[0] - y.along[0]);
    }
    case "TP": {
      const lower: [number, number] = [z[0], PANTRY_SPLIT_MM];
      const upper: [number, number] = [PANTRY_SPLIT_MM, z[1]];
      return [
        { kind: "door", along: full, z: lower, handle: doorHandle(full, lower, "right", true), grooveEdge: "top" },
        { kind: "door", along: full, z: upper, handle: doorHandle(full, upper, "right", false), grooveEdge: "bottom" },
      ];
    }
    case "T": {
      // Drawer below the oven, the housed appliances as glass, filler strips between, a flap on top.
      const fronts: Front[] = [];
      let at = z[0];
      const slots = (mod.hosts ?? [])
        .map((id) => {
          const spec = getAppliance(cat, id);
          const bottom = FITTED_BOTTOM_MM[id] ?? FITTED_BOTTOM_MM.oven;
          return { id, z: [bottom, bottom + spec.heightMm] as [number, number], fitted: hosted.includes(id) };
        })
        .sort((a, b) => a.z[0] - b.z[0]);
      for (const [i, s] of slots.entries()) {
        if (s.z[0] > at) {
          const gap: [number, number] = [at, s.z[0]];
          fronts.push(
            i === 0
              ? { kind: "drawer", along: full, z: gap, handle: barHandle(full, gap, "top"), grooveEdge: "top" }
              : { kind: "panel", along: full, z: gap, handle: null, grooveEdge: null },
          );
        }
        fronts.push(s.fitted ? { kind: "glass", along: full, z: s.z, handle: null, grooveEdge: null, appliance: s.id } : { kind: "panel" as const, along: full, z: s.z, handle: null, grooveEdge: null });
        at = s.z[1];
      }
      if (z[1] > at) {
        const top: [number, number] = [at, z[1]];
        fronts.push({ kind: "door", along: full, z: top, handle: barHandle(full, top, "bottom"), grooveEdge: "bottom" });
      }
      return fronts;
    }
    default:
      return doors(full, z, p.layer);
  }
}

// ---------------------------------------------------------------------------
// Units

const inset = (r: [number, number], d: number): [number, number] => [r[0] + d, r[1] - d];

/** Parts of the sink or hob fitted in a base unit, in the host's local mm. */
function countertopAppliance(spec: Appliance, hostWidth: number): Part[] {
  const c = hostWidth / 2;
  const mid = COUNTERTOP_DEPTH_MM / 2;
  const top = ZONES.countertop.top;
  if (spec.id === "hob") {
    const along: [number, number] = [c - spec.widthMm / 2, c + spec.widthMm / 2];
    const depth: [number, number] = [mid - spec.depthMm / 2, mid + spec.depthMm / 2];
    const rings: Part[] = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([i, j], k) => ({
      kind: "ring",
      key: `hob-ring-${k}`,
      centre: { along: c + i * 210, depth: mid + j * 115, z: top + 9 },
      radiusMm: k === 2 ? 85 : 65,
      material: "burner",
    }));
    return [{ kind: "box", key: "hob-glass", box: { along, depth, z: [top, top + 8] }, material: "glass", edges: true }, ...rings];
  }
  if (spec.id === "sink" && spec.cutOut) {
    const a: [number, number] = [c - spec.cutOut.widthMm / 2, c + spec.cutOut.widthMm / 2];
    const d: [number, number] = [mid - spec.cutOut.depthMm / 2, mid + spec.cutOut.depthMm / 2];
    const T = 8;
    const RIM = 15;
    const bottom = top - 200;
    const wall = (key: string, along: [number, number], depth: [number, number]): Part => ({ kind: "box", key, box: { along, depth, z: [bottom, top] }, material: "steel" });
    const rim = (key: string, along: [number, number], depth: [number, number]): Part => ({ kind: "box", key, box: { along, depth, z: [top, top + 2] }, material: "steel", edges: true });
    return [
      { kind: "box", key: "sink-floor", box: { along: a, depth: d, z: [bottom, bottom + T] }, material: "steel" },
      wall("sink-back", a, [d[0], d[0] + T]),
      wall("sink-front", a, [d[1] - T, d[1]]),
      wall("sink-left", [a[0], a[0] + T], d),
      wall("sink-right", [a[1] - T, a[1]], d),
      rim("sink-rim-back", [a[0] - RIM, a[1] + RIM], [d[0] - RIM, d[0]]),
      rim("sink-rim-front", [a[0] - RIM, a[1] + RIM], [d[1], d[1] + RIM]),
      rim("sink-rim-left", [a[0] - RIM, a[0]], d),
      rim("sink-rim-right", [a[1], a[1] + RIM], d),
      // Tap: a stem behind the bowl and a spout reaching over it.
      { kind: "box", key: "tap-stem", box: { along: [c - 16, c + 16], depth: [d[0] - 50, d[0] - 18], z: [top, top + 260] }, material: "steel", edges: true },
      { kind: "box", key: "tap-spout", box: { along: [c - 11, c + 11], depth: [d[0] - 50, d[0] + 150], z: [top + 236, top + 258] }, material: "steel", edges: true },
    ];
  }
  return [];
}

/** Handle bar or handleless groove for one front; returns the front's face range after any groove. */
function frontParts(f: Front, i: number, depth: number, material: MaterialKey, handleless: boolean): Part[] {
  const along = inset(f.along, REVEAL_MM / 2);
  let z = inset(f.z, REVEAL_MM / 2);
  const parts: Part[] = [];
  const face: [number, number] = [depth, depth + SHUTTER_MM];
  if (f.kind === "door" || f.kind === "drawer") {
    if (handleless && f.grooveEdge) {
      const g: [number, number] = f.grooveEdge === "top" ? [z[1] - GROOVE_MM, z[1]] : [z[0], z[0] + GROOVE_MM];
      z = f.grooveEdge === "top" ? [z[0], z[1] - GROOVE_MM] : [z[0] + GROOVE_MM, z[1]];
      parts.push({ kind: "box", key: `groove-${i}`, box: { along, depth: [depth, depth + SHUTTER_MM - 4], z: g }, material: "groove" });
    } else if (f.handle) {
      parts.push({ kind: "box", key: `handle-${i}`, box: { along: f.handle.along, depth: [face[1], face[1] + 14], z: f.handle.z }, material: "handle" });
    }
  }
  parts.unshift({ kind: "box", key: `front-${i}`, box: { along, depth: face, z }, material: f.kind === "glass" ? "glass" : material, edges: true });
  return parts;
}

/**
 * Everything drawn for one unit, in its local mm: carcass, plinth, fronts and handles. `hosted`
 * lists the appliances fitted in it, which leave their slots to fittedParts.
 */
export function unitParts(p: ModulePlacement, cat: Catalogue, hosted: readonly string[] = []): Part[] {
  const mod = getModule(cat, p.moduleCode);
  const isFiller = mod.family === "FIL";
  const depth = isFiller ? LAYER_DEPTH_MM[p.layer] : mod.depthMm;
  const z = bodyBand(mod, p.layer);
  const w = p.widthMm;
  const finish = finishMaterial(p.finishId);
  const handleless = p.shutterTypeId === "handleless";
  const parts: Part[] = [];

  if (p.layer === "base" || p.layer === "tall") {
    parts.push({ kind: "box", key: "plinth", box: { along: [0, w], depth: [0, depth - PLINTH_SETBACK_MM], z: [ZONES.plinth.bottom, ZONES.plinth.top] }, material: "plinth" });
  }
  if (!isFiller) parts.push({ kind: "box", key: "carcass", box: { along: [0, w], depth: [0, depth], z }, material: "carcass", edges: true });

  // Glass fronts belong to the fitted oven or microwave (see fittedParts), so they pick separately.
  frontDivisions(p, cat, hosted).forEach((f, i) => {
    if (f.kind !== "glass") parts.push(...frontParts(f, i, depth, finish, handleless));
  });
  return parts;
}

/**
 * A fitted appliance in its host's local mm: the sink basin and tap or the hob glass for a base
 * host, the black glass front for an oven or microwave in a tall housing.
 */
export function fittedParts(host: ModulePlacement, cat: Catalogue, applianceId: string): Part[] {
  const spec = getAppliance(cat, applianceId);
  if (spec.cutOut) return countertopAppliance(spec, host.widthMm);
  const mod = getModule(cat, host.moduleCode);
  const front = frontDivisions(host, cat, [applianceId]).find((f) => f.kind === "glass" && f.appliance === applianceId);
  if (!front) return [];
  return frontParts(front, 0, mod.depthMm, "glass", false).map((part) => ({ ...part, key: `${applianceId}-${part.key}` }));
}

/** A free appliance in its local mm. The dishwasher takes the base finish. */
export function applianceParts(spec: Appliance, baseFinishId: string): Part[] {
  const w = spec.widthMm;
  switch (spec.id) {
    case "chimney": {
      const z0 = ZONES.chimney.top - spec.heightMm;
      const flue: [number, number] = [w / 2 - 150, w / 2 + 150];
      const flueDepth: [number, number] = [0, 260];
      const hoodTop = z0 + 160;
      return [
        { kind: "box", key: "hood-lip", box: { along: [0, w], depth: [0, spec.depthMm], z: [z0, z0 + 40] }, material: "steel", edges: true },
        { kind: "taper", key: "hood", box: { along: [0, w], depth: [0, spec.depthMm], z: [z0 + 40, hoodTop] }, top: { along: flue, depth: flueDepth }, material: "steel", edges: true },
        { kind: "box", key: "flue", box: { along: flue, depth: flueDepth, z: [hoodTop, ZONES.chimney.top] }, material: "steel", edges: true },
      ];
    }
    case "dishwasher": {
      const d = spec.depthMm;
      const body: [number, number] = [ZONES.plinth.top, ZONES.baseCarcass.top];
      const face = inset([0, w], REVEAL_MM / 2);
      return [
        { kind: "box", key: "plinth", box: { along: [0, w], depth: [0, d - PLINTH_SETBACK_MM], z: [0, ZONES.plinth.top] }, material: "plinth" },
        { kind: "box", key: "body", box: { along: [0, w], depth: [0, d], z: body }, material: "carcass", edges: true },
        { kind: "box", key: "panel", box: { along: face, depth: [d, d + SHUTTER_MM], z: inset(body, REVEAL_MM / 2) }, material: finishMaterial(baseFinishId), edges: true },
        { kind: "box", key: "handle", box: { along: [HANDLE_INSET_MM, w - HANDLE_INSET_MM], depth: [d + SHUTTER_MM, d + SHUTTER_MM + 14], z: [body[1] - 42, body[1] - 30] }, material: "handle" },
      ];
    }
    case "fridge":
      return [{ kind: "outline", key: "space", box: { along: [0, w], depth: [0, spec.depthMm], z: [0, spec.heightMm] }, label: spec.name }];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Room

export const CUT_HEIGHT_MM = 450;
/**
 * "cut": every wall stops at 450 mm. "full": full height, and the walls between the camera and
 * the room fade. "auto": full height, and the walls between the camera and the room are hidden.
 */
export type WallHeightMode = "cut" | "full" | "auto";

export function wallHeight(mode: WallHeightMode, room: Room): number {
  return mode === "cut" ? Math.min(CUT_HEIGHT_MM, room.ceilingHeightMm) : room.ceilingHeightMm;
}

/** How directly the camera must look through a wall (cosine) before it counts as in the way. */
export const THROUGH_WALL_COS = 0.25;

/** What `wallsInFront` needs to know about the room: each wall's inward normal and midpoint, and the room's centre. */
export interface WallFacing {
  normals: Record<string, Point>;
  mids: Record<string, Point>;
  centre: Point;
}

/**
 * The walls between the camera and the room, which Auto hides. `viewDir` is the plan part
 * (world x, world y) of the camera's unit viewing direction, so a steep view has a short one: a
 * view from above (the Top preset) sees over every wall and hides none. Otherwise a wall is in
 * the way if the camera looks through it (along its inward normal), or if it stands on the
 * camera's side of the room centre: a duct-box or notch wall whose room face points at the
 * camera still blocks the view of the kitchen behind it.
 */
export function wallsInFront(room: WallFacing, viewDir: Point, minCos = THROUGH_WALL_COS): string[] {
  if (Math.hypot(viewDir.x, viewDir.y) <= minCos) return [];
  return Object.keys(room.normals).filter((id) => {
    const n = room.normals[id];
    const m = room.mids[id];
    const through = viewDir.x * n.x + viewDir.y * n.y > minCos;
    const nearSide = (m.x - room.centre.x) * viewDir.x + (m.y - room.centre.y) * viewDir.y < 0;
    return through || nearSide;
  });
}

export interface RoomPart {
  key: string;
  box: Box;
  material: MaterialKey;
  /** The wall it belongs to, so it fades (Full height) or hides (Auto) with that wall. */
  wallId?: string;
}

export interface RoomModel extends WallFacing {
  floor: Point[];
  height: number;
  walls: RoomPart[];
  parts: RoomPart[];
}

const WINDOW_FRAME_MM = 50;

/** Solid sub-ranges of [0, top] left after taking out `holes`. */
function subtract([lo, hi]: [number, number], holes: [number, number][]): [number, number][] {
  let out: [number, number][] = [[lo, hi]];
  for (const [a, b] of holes) {
    out = out.flatMap(([x, y]): [number, number][] => {
      if (b <= x || a >= y) return [[x, y]];
      const keep: [number, number][] = [];
      if (a > x) keep.push([x, a]);
      if (b < y) keep.push([b, y]);
      return keep;
    });
  }
  return out;
}

/**
 * Along-wall extent of each wall's box: the wall arriving at a convex corner also covers the
 * corner square, and stops short of a reflex corner where the next wall's box already is, so
 * corners are solid and no two boxes overlap.
 */
function wallExtents(room: Room): Map<string, [number, number]> {
  const segs = wallSegments(room);
  const frames = new Map(wallFrames(room).map((f) => [f.wallId, f]));
  const closed = isChainClosed(room);
  const T = WALL_THICKNESS_MM;
  const out = new Map<string, [number, number]>();
  segs.forEach((s, i) => {
    if (s.open) return;
    // A wall next to an open segment (or the open end) stops square at its end.
    const after = i < segs.length - 1 ? segs[i + 1] : closed ? segs[0] : null;
    const next = after && !after.open ? after : null;
    const turn = next === null ? 0 : Math.sign(next.dir.x * s.inwardNormal.x + next.dir.y * s.inwardNormal.y);
    const f = frames.get(s.wallId)!;
    const travelEndAtLength = f.origin.x === s.start.x && f.origin.y === s.start.y;
    const ext: [number, number] = [0, f.lengthMm];
    // turn > 0: convex corner, grow into the corner square; turn < 0: reflex, give way.
    if (travelEndAtLength) ext[1] += turn * T;
    else ext[0] -= turn * T;
    out.set(s.wallId, ext);
  });
  return out;
}

/** The duct box as a solid between the notch walls' outer faces and the outer wall line. */
function ductBox(room: Room, fromWallId: string, toWallId: string, height: number): Box | null {
  const ids = room.walls.map((w) => w.id);
  const i0 = ids.indexOf(fromWallId);
  const i1 = ids.indexOf(toWallId);
  if (i0 < 0 || i1 < i0) return null;
  const pts = roomVertices(room).slice(i0, i1 + 2);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const r = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  if (r.minX === r.maxX || r.minY === r.maxY) return null;
  const segs = wallSegments(room).slice(i0, i1 + 1);
  const T = WALL_THICKNESS_MM;
  const onLine = (axis: "x" | "y", v: number) => segs.some((s) => s.start[axis] === v && s.end[axis] === v);
  // Sides with a notch wall lose its thickness; the open side reaches the outer wall face.
  const side = (axis: "x" | "y", v: number, sign: 1 | -1) => (onLine(axis, v) ? v + sign * T : v - sign * T);
  return {
    minX: side("x", r.minX, 1),
    maxX: side("x", r.maxX, -1),
    minY: side("y", r.minY, 1),
    maxY: side("y", r.maxY, -1),
    minZ: 0,
    maxZ: height,
  };
}

/**
 * Walls as boxes per segment, 100 mm thick outside the interior, split around window and door
 * openings so the openings are real holes; plus window frames and panes, columns, beams and
 * the duct box. In "cut" mode walls (and the duct box) stop at 450 mm.
 */
export function roomModel(room: Room, mode: WallHeightMode): RoomModel {
  const H = wallHeight(mode, room);
  const T = WALL_THICKNESS_MM;
  const ceiling = room.ceilingHeightMm;
  const extents = wallExtents(room);
  const walls: RoomPart[] = [];
  const parts: RoomPart[] = [];
  const normals: Record<string, Point> = {};
  const mids: Record<string, Point> = {};

  for (const frame of wallFrames(room)) {
    normals[frame.wallId] = frame.n;
    mids[frame.wallId] = wallToWorld(frame, frame.lengthMm / 2);
    const [lo, hi] = extents.get(frame.wallId)!;
    const openings: { along: [number, number]; z: [number, number] }[] = [];
    for (const f of room.features) {
      if (f.kind === "window" && f.wallId === frame.wallId && f.sillMm < H) {
        const along: [number, number] = [f.offsetMm, f.offsetMm + f.widthMm];
        const z: [number, number] = [f.sillMm, Math.min(f.topMm, H)];
        openings.push({ along, z });
        const fz = WINDOW_FRAME_MM;
        const depth: [number, number] = [-70, -30];
        const bars: [string, [number, number], [number, number]][] = [
          ["l", [along[0], along[0] + fz], z],
          ["r", [along[1] - fz, along[1]], z],
          ["b", [along[0] + fz, along[1] - fz], [z[0], z[0] + fz]],
        ];
        if (f.topMm <= H) bars.push(["t", [along[0] + fz, along[1] - fz], [z[1] - fz, z[1]]]);
        for (const [k, a, zz] of bars) parts.push({ key: `${f.id}-frame-${k}`, box: wallBoxToWorld(frame, { along: a, depth, z: zz }), material: "frame", wallId: frame.wallId });
        parts.push({ key: `${f.id}-pane`, box: wallBoxToWorld(frame, { along: inset(along, fz), depth: [-52, -48], z: [z[0] + fz, f.topMm <= H ? z[1] - fz : z[1]] }), material: "pane", wallId: frame.wallId });
      }
      if (f.kind === "door" && f.wallId === frame.wallId) {
        openings.push({ along: [f.offsetMm, f.offsetMm + f.widthMm], z: [0, Math.min(f.heightMm, H)] });
      }
    }

    const cuts = [...new Set([lo, hi, ...openings.flatMap((o) => o.along)])].filter((v) => v >= lo && v <= hi).sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const along: [number, number] = [cuts[i], cuts[i + 1]];
      const holes = openings.filter((o) => o.along[0] <= along[0] && o.along[1] >= along[1]).map((o) => o.z);
      for (const z of subtract([0, H], holes)) {
        walls.push({ key: `${frame.wallId}-${along[0]}-${z[0]}`, box: wallBoxToWorld(frame, { along, depth: [-T, 0], z }), material: "wall", wallId: frame.wallId });
      }
    }
  }

  for (const f of room.features) {
    if (f.kind === "column") {
      parts.push({ key: f.id, box: { minX: f.x, maxX: f.x + f.widthMm, minY: f.y, maxY: f.y + f.depthMm, minZ: 0, maxZ: ceiling }, material: "wall" });
    }
    if (f.kind === "beam") {
      const frame = wallFrames(room).find((x) => x.wallId === f.wallId);
      if (frame) parts.push({ key: f.id, box: wallBoxToWorld(frame, { along: [0, frame.lengthMm], depth: [0, f.depthMm], z: [f.bottomMm, ceiling] }), material: "wall", wallId: f.wallId });
    }
    if (f.kind === "ductBox" && f.fromWallId && f.toWallId) {
      const box = ductBox(room, f.fromWallId, f.toWallId, H);
      // It fades with the notch's middle wall, the face it shows the room.
      const ids = room.walls.map((w) => w.id);
      const middle = ids[Math.floor((ids.indexOf(f.fromWallId) + ids.indexOf(f.toWallId)) / 2)];
      if (box) parts.push({ key: f.id, box, material: "wall", wallId: middle });
    }
  }

  const floor = roomOutline(room, 0).inner;
  const xs = floor.map((p) => p.x);
  const ys = floor.map((p) => p.y);
  const centre = floor.length ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 } : { x: 0, y: 0 };
  return { floor, height: H, walls, parts, normals, mids, centre };
}

// ---------------------------------------------------------------------------
// Unit pose

/**
 * Where a unit stands in the 3D view: its left-back corner on the wall (world mm) and its turn
 * about the vertical, in radians. That is the whole pose: units never tip about x or z.
 */
export interface UnitPose {
  x: number;
  y: number;
  yaw: number;
}

export function unitPose(frame: WallFrame, offsetMm: number): UnitPose {
  const o = wallToWorld(frame, offsetMm, 0);
  return { x: o.x, y: o.y, yaw: Math.atan2(-frame.u.y, frame.u.x) };
}

// ---------------------------------------------------------------------------
// Countertop

export interface CountertopSlabShape {
  key: string;
  outline: Point[];
  holes: Point[][];
}

const rectPoints = (r: Rect): Point[] => [
  { x: r.minX, y: r.minY },
  { x: r.maxX, y: r.minY },
  { x: r.maxX, y: r.maxY },
  { x: r.minX, y: r.maxY },
];

const contains = (outer: Rect, inner: Rect) => inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;

/** Countertop slabs in world mm (z from 820 to 860) with the sink and hob cut-outs as holes. */
export function countertopModel(project: Project, cat: Catalogue): CountertopSlabShape[] {
  const { slabs, cutOuts } = countertopOutline(project, cat);
  return slabs.map((slab) => ({
    key: `${slab.wallId}-${slab.rect.minX}-${slab.rect.minY}-${slab.rect.maxX}-${slab.rect.maxY}`,
    outline: rectPoints(slab.rect),
    holes: cutOuts.filter((c) => contains(slab.rect, c.rect)).map((c) => rectPoints(c.rect)),
  }));
}
