import { catalogue as defaultCatalogue, getAppliance, getModule } from "./catalogue";
import type {
  AppliancePlacement,
  BeamFeature,
  BlindSide,
  Box,
  Catalogue,
  ColumnFeature,
  Heading,
  Layer,
  ModulePlacement,
  Placement,
  Point,
  Project,
  Rect,
  Room,
  Wall,
} from "./types";
import { COUNTERTOP_DEPTH_MM, ZONES } from "./zones";

// ---------------------------------------------------------------------------
// Walls

const HEADING_VECTORS: Record<Heading, Point> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export interface WallSegment {
  wallId: string;
  index: number;
  start: Point;
  end: Point;
  dir: Point; // unit direction of travel
  inwardNormal: Point; // unit normal pointing into the room
  lengthMm: number;
}

/** Corner points: vertex i is the start of wall i. Includes the final end point. */
export function roomVertices(room: Room): Point[] {
  const pts: Point[] = [{ x: 0, y: 0 }];
  for (const wall of room.walls) {
    const prev = pts[pts.length - 1];
    const d = HEADING_VECTORS[wall.heading];
    pts.push({ x: prev.x + d.x * wall.lengthMm, y: prev.y + d.y * wall.lengthMm });
  }
  return pts;
}

/**
 * Shoelace area in world coordinates (y down). Positive means the walls run clockwise on
 * screen, i.e. the interior is on the right of travel. An open room is closed by the chord
 * back to the origin.
 */
export function signedArea(room: Room): number {
  const pts = roomVertices(room);
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function isRoomClosed(room: Room): boolean {
  if (room.walls.length < 4) return false;
  const end = roomVertices(room)[room.walls.length];
  return end.x === 0 && end.y === 0;
}

export function wallSegments(room: Room): WallSegment[] {
  const pts = roomVertices(room);
  const clockwise = signedArea(room) >= 0;
  return room.walls.map((wall, i) => {
    const dir = HEADING_VECTORS[wall.heading];
    const inwardNormal = clockwise ? { x: -dir.y, y: dir.x } : { x: dir.y, y: -dir.x };
    return {
      wallId: wall.id,
      index: i,
      start: pts[i],
      end: pts[i + 1],
      dir,
      inwardNormal,
      lengthMm: wall.lengthMm,
    };
  });
}

/**
 * Wall-local frame used by elevations and rules. `origin` is the wall's left end as seen
 * from inside the room and `u` points to the viewer's right, so offset 0 is always on the
 * left of the elevation. `n` points into the room (depth).
 */
export interface WallFrame {
  wallId: string;
  index: number;
  origin: Point;
  u: Point;
  n: Point;
  lengthMm: number;
}

export function wallFrames(room: Room): WallFrame[] {
  return wallSegments(room).map((s) => {
    const n = s.inwardNormal;
    // Facing the wall means facing -n; the viewer's right is (n.y, -n.x).
    const u = { x: n.y, y: -n.x };
    const sameWay = u.x === s.dir.x && u.y === s.dir.y;
    return {
      wallId: s.wallId,
      index: s.index,
      origin: sameWay ? s.start : s.end,
      u,
      n,
      lengthMm: s.lengthMm,
    };
  });
}

export function wallFrame(room: Room, wallId: string): WallFrame {
  const frame = wallFrames(room).find((f) => f.wallId === wallId);
  if (!frame) throw new Error(`Unknown wall ${wallId}`);
  return frame;
}

export function findWall(room: Room, wallId: string): Wall | undefined {
  return room.walls.find((w) => w.id === wallId);
}

// ---------------------------------------------------------------------------
// World <-> wall-local conversion (offset along the wall, depth into the room)

export function wallToWorld(frame: WallFrame, offsetMm: number, depthMm = 0): Point {
  return {
    x: frame.origin.x + frame.u.x * offsetMm + frame.n.x * depthMm,
    y: frame.origin.y + frame.u.y * offsetMm + frame.n.y * depthMm,
  };
}

export function worldToWall(frame: WallFrame, p: Point): { offsetMm: number; depthMm: number } {
  const dx = p.x - frame.origin.x;
  const dy = p.y - frame.origin.y;
  return { offsetMm: dx * frame.u.x + dy * frame.u.y, depthMm: dx * frame.n.x + dy * frame.n.y };
}

export interface WallBox {
  along: [number, number];
  depth: [number, number];
  z: [number, number];
}

export function wallBoxToWorld(frame: WallFrame, wb: WallBox): Box {
  const a = wallToWorld(frame, wb.along[0], wb.depth[0]);
  const b = wallToWorld(frame, wb.along[1], wb.depth[1]);
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxY: Math.max(a.y, b.y),
    minZ: wb.z[0],
    maxZ: wb.z[1],
  };
}

export function worldBoxToWall(frame: WallFrame, box: Box): WallBox {
  const a = worldToWall(frame, { x: box.minX, y: box.minY });
  const b = worldToWall(frame, { x: box.maxX, y: box.maxY });
  return {
    along: [Math.min(a.offsetMm, b.offsetMm), Math.max(a.offsetMm, b.offsetMm)],
    depth: [Math.min(a.depthMm, b.depthMm), Math.max(a.depthMm, b.depthMm)],
    z: [box.minZ, box.maxZ],
  };
}

// ---------------------------------------------------------------------------
// Boxes

/** Strict intersection: boxes that only touch do not intersect. */
export function boxesIntersect(a: Box, b: Box): boolean {
  return (
    a.minX < b.maxX &&
    b.minX < a.maxX &&
    a.minY < b.maxY &&
    b.minY < a.maxY &&
    a.minZ < b.maxZ &&
    b.minZ < a.maxZ
  );
}

export function rangesOverlap(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export function columnToBox(column: ColumnFeature, ceilingHeightMm: number): Box {
  return {
    minX: column.x,
    maxX: column.x + column.widthMm,
    minY: column.y,
    maxY: column.y + column.depthMm,
    minZ: 0,
    maxZ: ceilingHeightMm,
  };
}

/** The beam as a box: the whole wall, `depthMm` into the room, from its bottom to the ceiling. */
export function beamToBox(room: Room, beam: BeamFeature): Box | null {
  const frame = wallFrames(room).find((f) => f.wallId === beam.wallId);
  if (!frame) return null;
  return wallBoxToWorld(frame, {
    along: [0, frame.lengthMm],
    depth: [0, beam.depthMm],
    z: [beam.bottomMm, room.ceilingHeightMm],
  });
}

/** Default blind side for a blind corner unit: the side facing the nearer end of its wall. */
export function defaultBlindSide(room: Room, wallId: string, offsetMm: number, widthMm: number): BlindSide {
  const wall = findWall(room, wallId);
  if (!wall) return "right";
  return offsetMm + widthMm / 2 < wall.lengthMm / 2 ? "left" : "right";
}

/**
 * Along-wall range of a blind corner unit's blind section: the part of its front hidden
 * behind the perpendicular run, one base-carcass depth wide on the blind side.
 */
export function blindRange(p: ModulePlacement): [number, number] | null {
  if (!p.blindSide) return null;
  const blind = LAYER_DEPTH_MM.base;
  return p.blindSide === "left" ? [p.offsetMm, p.offsetMm + blind] : [p.offsetMm + p.widthMm - blind, p.offsetMm + p.widthMm];
}

export const isModulePlacement = (p: Placement): p is ModulePlacement => "moduleCode" in p;
export const isAppliancePlacement = (p: Placement): p is AppliancePlacement => "applianceId" in p;

/** Default carcass depth of each layer; fillers take this depth. */
export const LAYER_DEPTH_MM: Record<Layer, number> = { base: 560, wall: 350, loft: 350, tall: 560 };

/** The wall-run slot a placement occupies, or null for hosted appliances. */
export interface WallSlot {
  wallId: string;
  layer: Layer;
  offsetMm: number;
  widthMm: number;
}

export function placementSlot(placement: Placement, cat: Catalogue = defaultCatalogue): WallSlot | null {
  if (isModulePlacement(placement)) {
    return {
      wallId: placement.wallId,
      layer: placement.layer,
      offsetMm: placement.offsetMm,
      widthMm: placement.widthMm,
    };
  }
  if (placement.kind === "hosted") return null;
  return {
    wallId: placement.wallId,
    layer: placement.layer,
    offsetMm: placement.offsetMm,
    widthMm: getAppliance(cat, placement.applianceId).widthMm,
  };
}

function moduleWallBox(p: ModulePlacement, cat: Catalogue): WallBox {
  const mod = getModule(cat, p.moduleCode);
  const isFiller = mod.family === "FIL";
  const depth = isFiller ? LAYER_DEPTH_MM[p.layer] : mod.depthMm;
  let z: [number, number];
  switch (p.layer) {
    case "base":
      z = [ZONES.plinth.bottom, ZONES.baseCarcass.top];
      break;
    case "wall":
      z = [ZONES.wall.bottom, ZONES.wall.top];
      break;
    case "loft":
      z = [ZONES.loft.bottom, ZONES.loft.bottom + (isFiller ? 400 : mod.heightMm)];
      break;
    case "tall":
      z = [ZONES.tall.bottom, ZONES.tall.top];
      break;
  }
  return { along: [p.offsetMm, p.offsetMm + p.widthMm], depth: [0, depth], z };
}

function applianceWallBox(project: Project, p: AppliancePlacement, cat: Catalogue): { wallId: string; wb: WallBox } {
  const app = getAppliance(cat, p.applianceId);
  if (p.kind === "free") {
    const z: [number, number] =
      p.layer === "wall"
        ? [ZONES.chimney.top - app.heightMm, ZONES.chimney.top]
        : [0, app.heightMm];
    return {
      wallId: p.wallId,
      wb: { along: [p.offsetMm, p.offsetMm + app.widthMm], depth: [0, app.depthMm], z },
    };
  }
  const host = project.modules.find((m) => m.id === p.hostPlacementId);
  if (!host) throw new Error(`Hosted appliance ${p.id} has no host ${p.hostPlacementId}`);
  const hostBox = moduleWallBox(host, cat);
  const centre = host.offsetMm + host.widthMm / 2;
  const along: [number, number] = [centre - app.widthMm / 2, centre + app.widthMm / 2];
  const top = ZONES.countertop.top;
  const ctrDepth = COUNTERTOP_DEPTH_MM / 2;
  switch (app.id) {
    case "sink":
      return {
        wallId: host.wallId,
        wb: { along, depth: [ctrDepth - app.depthMm / 2, ctrDepth + app.depthMm / 2], z: [top - app.heightMm, top] },
      };
    case "hob":
      return {
        wallId: host.wallId,
        wb: { along, depth: [ctrDepth - app.depthMm / 2, ctrDepth + app.depthMm / 2], z: [top - 60, top - 60 + app.heightMm] },
      };
    default: {
      // Oven low, microwave above it, both flush with the front of the tall host.
      const front = hostBox.depth[1];
      const bottom = app.id === "oven" ? 700 : 1350;
      return {
        wallId: host.wallId,
        wb: { along, depth: [front - app.depthMm, front], z: [bottom, bottom + app.heightMm] },
      };
    }
  }
}

/** Wall id and wall-local box of any placement. */
export function placementToWallBox(
  project: Project,
  placement: Placement,
  cat: Catalogue = defaultCatalogue,
): { wallId: string; wb: WallBox } {
  if (isModulePlacement(placement)) return { wallId: placement.wallId, wb: moduleWallBox(placement, cat) };
  return applianceWallBox(project, placement, cat);
}

/**
 * The single source of truth for where a placement is in the world. Rules, the 2D plan and
 * the 3D view all use this. Corners work automatically because boxes on different walls
 * share one world frame.
 */
export interface WorldBox extends Box {
  /** For blind corner units: the blind section, which the perpendicular run sits in front of. */
  blindPart?: Box;
}

export function placementToWorldBox(project: Project, placement: Placement, cat: Catalogue = defaultCatalogue): WorldBox {
  const { wallId, wb } = placementToWallBox(project, placement, cat);
  const frame = wallFrame(project.room, wallId);
  const box: WorldBox = wallBoxToWorld(frame, wb);
  const blind = isModulePlacement(placement) ? blindRange(placement) : null;
  if (blind) box.blindPart = wallBoxToWorld(frame, { ...wb, along: blind });
  return box;
}

export function allPlacements(project: Project): Placement[] {
  return [...project.modules, ...project.appliances];
}

/** Units standing on a wall: its modules and free appliances (fitted appliances go with their hosts). */
export function placementsOnWall(project: Project, wallId: string): Placement[] {
  return [
    ...project.modules.filter((m) => m.wallId === wallId),
    ...project.appliances.filter((a) => a.kind === "free" && a.wallId === wallId),
  ];
}

export function findPlacement(project: Project, id: string): Placement | undefined {
  return project.modules.find((m) => m.id === id) ?? project.appliances.find((a) => a.id === id);
}

// ---------------------------------------------------------------------------
// Countertop

export interface CountertopSlab {
  wallId: string;
  rect: Rect;
}

export interface CountertopCutOut {
  placementId: string; // the hosted appliance
  applianceId: string;
  rect: Rect;
}

export interface CountertopOutline {
  slabs: CountertopSlab[];
  cutOuts: CountertopCutOut[];
}

/**
 * Countertop rectangles per contiguous base run (base modules and dishwashers), 600 mm deep.
 * Where runs on two walls meet at a corner, the later wall's slab is trimmed so the corner
 * square is counted once.
 */
export function countertopOutline(project: Project, cat: Catalogue = defaultCatalogue): CountertopOutline {
  const frames = wallFrames(project.room);
  const depth = cat.countertop.depthMm;
  const slabs: CountertopSlab[] = [];

  for (const frame of frames) {
    const intervals: [number, number][] = allPlacements(project)
      .map((p) => placementSlot(p, cat))
      .filter((s): s is WallSlot => s !== null && s.wallId === frame.wallId && s.layer === "base")
      .map((s) => [s.offsetMm, s.offsetMm + s.widthMm] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    const runs: [number, number][] = [];
    for (const iv of intervals) {
      const last = runs[runs.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else runs.push([iv[0], iv[1]]);
    }

    for (const run of runs) {
      let [a0, a1] = run;
      for (const earlier of slabs) {
        const e = worldBoxToWall(frame, { ...earlier.rect, minZ: 0, maxZ: 1 });
        const coversDepth = e.depth[0] <= 0 && e.depth[1] >= depth;
        if (!coversDepth || !rangesOverlap(e.along, [a0, a1])) continue;
        if (e.along[0] <= a0) a0 = Math.max(a0, e.along[1]);
        else if (e.along[1] >= a1) a1 = Math.min(a1, e.along[0]);
      }
      if (a1 <= a0) continue;
      const box = wallBoxToWorld(frame, { along: [a0, a1], depth: [0, depth], z: [0, 1] });
      slabs.push({ wallId: frame.wallId, rect: { minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY } });
    }
  }

  const cutOuts: CountertopCutOut[] = [];
  for (const app of project.appliances) {
    if (app.kind !== "hosted") continue;
    const spec = getAppliance(cat, app.applianceId);
    if (!spec.cutOut) continue;
    const host = project.modules.find((m) => m.id === app.hostPlacementId);
    if (!host) continue;
    const frame = wallFrame(project.room, host.wallId);
    const centre = host.offsetMm + host.widthMm / 2;
    const { widthMm, depthMm } = spec.cutOut;
    const box = wallBoxToWorld(frame, {
      along: [centre - widthMm / 2, centre + widthMm / 2],
      depth: [depth / 2 - depthMm / 2, depth / 2 + depthMm / 2],
      z: [0, 1],
    });
    cutOuts.push({
      placementId: app.id,
      applianceId: spec.id,
      rect: { minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY },
    });
  }

  return { slabs, cutOuts };
}

export const rectArea = (r: Rect) => (r.maxX - r.minX) * (r.maxY - r.minY);

// ---------------------------------------------------------------------------
// Room outline for drawing

/**
 * Inner polygon (the room) and outer polygon offset outward by `thicknessMm`. Works for
 * both convex and reflex corners because walls are orthogonal.
 */
export function roomOutline(room: Room, thicknessMm: number): { inner: Point[]; outer: Point[] } {
  const segs = wallSegments(room);
  if (segs.length === 0) return { inner: [], outer: [] };
  const closed = isRoomClosed(room);
  const offset = (p: Point, a: Point, b: Point) => ({
    x: p.x - (a.x + b.x) * thicknessMm,
    y: p.y - (a.y + b.y) * thicknessMm,
  });
  const zero = { x: 0, y: 0 };
  const inner = segs.map((s) => s.start);
  const outer = segs.map((s, i) => {
    // An open room's first corner only has one wall, so only that wall's normal applies.
    const prev = i === 0 && !closed ? zero : segs[(i - 1 + segs.length) % segs.length].inwardNormal;
    return offset(s.start, s.inwardNormal, prev);
  });
  if (!closed) {
    const last = segs[segs.length - 1];
    inner.push(last.end);
    outer.push(offset(last.end, last.inwardNormal, zero));
  }
  return { inner, outer };
}
