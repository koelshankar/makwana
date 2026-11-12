// Material factory and geometry cache for the 3D view. Materials are keyed by role or finish
// id, so Level 2 textures can be plugged in here without touching the components. Nothing in
// this file is created per frame: materials live for the session, unit geometries are cached
// by their part list (identical units share one), and room/countertop geometries are owned
// and disposed by the component that builds them.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { catalogue, getFinish } from "@/domain/catalogue";
import type { MaterialKey, OutlinePart, Part, RoomPart } from "@/domain/three-model";
import type { Box, Point } from "@/domain/types";

/** Scale: 1 three unit = 1 metre. World (x right, y down in plan, z up; mm) -> three (x, z, y) m. */
export const M = 1 / 1000;

const ROLES: Record<string, THREE.MeshStandardMaterialParameters> = {
  carcass: { color: "#EDEBE6", roughness: 0.85 },
  plinth: { color: "#4a4845", roughness: 0.9 },
  handle: { color: "#1b1b1b", roughness: 0.6 },
  groove: { color: "#232323", roughness: 0.9 },
  glass: { color: "#151515", roughness: 0.15, metalness: 0.1 },
  steel: { color: "#c9cdd1", roughness: 0.35, metalness: 0.25 },
  burner: { color: "#7a7a7a", roughness: 0.5 },
  countertop: { color: "#2B2B2B", roughness: 0.3, metalness: 0.05 },
  wall: { color: "#cfcac2", roughness: 0.95 },
  floor: { color: "#e4e0d9", roughness: 1 },
  pane: { color: "#cfe3f1", roughness: 0.1, transparent: true, opacity: 0.4, depthWrite: false },
  frame: { color: "#f4f2ee", roughness: 0.7 },
};

/** Gloss finishes read shinier than matte ones. Level 2: load the finish's textures here. */
function finishParams(finishId: string): THREE.MeshStandardMaterialParameters {
  const f = getFinish(catalogue, finishId);
  const roughness = /gloss/i.test(f.name) ? 0.22 : /matte/i.test(f.name) ? 0.85 : 0.6;
  return { color: f.hex, roughness };
}

const materials = new Map<string, THREE.MeshStandardMaterial>();

export function materialFor(key: MaterialKey): THREE.MeshStandardMaterial {
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(key.startsWith("finish:") ? finishParams(key.slice(7)) : ROLES[key]);
    materials.set(key, m);
  }
  return m;
}

/** A wall's own copy of a material, so it can fade on its own in Full height. */
export function fadingMaterial(key: MaterialKey, wallId: string): THREE.MeshStandardMaterial {
  const id = `${key}@${wallId}`;
  let m = materials.get(id);
  if (!m) {
    m = materialFor(key).clone();
    m.transparent = true;
    m.userData.baseOpacity = m.opacity;
    materials.set(id, m);
  }
  return m;
}

export const edgeMaterial = new THREE.LineBasicMaterial({ color: "#2a2826", transparent: true, opacity: 0.32 });

const fadingEdges = new Map<string, THREE.LineBasicMaterial>();
export function fadingEdgeMaterial(wallId: string): THREE.LineBasicMaterial {
  let m = fadingEdges.get(wallId);
  if (!m) {
    m = edgeMaterial.clone();
    m.userData.baseOpacity = m.opacity;
    fadingEdges.set(wallId, m);
  }
  return m;
}

/** Performance mode hides the edge lines. Their materials are shared, so this applies to every scene. */
export function setEdgeLines(on: boolean) {
  edgeMaterial.visible = on;
  for (const m of fadingEdges.values()) m.visible = on;
}

// ---------------------------------------------------------------------------
// Geometry

/** Plain position + normal, non-indexed, so any mix of parts can be merged. */
function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.deleteAttribute("uv");
  return out;
}

/** A box from min/max corners in three metres. */
function boxGeometry(x: [number, number], y: [number, number], z: [number, number]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x[1] - x[0], y[1] - y[0], z[1] - z[0]);
  g.translate((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2);
  return normalise(g);
}

/** Frustum from a bottom rectangle to a smaller top rectangle (local metres). */
function taperGeometry(bx: [number, number], bz: [number, number], tx: [number, number], tz: [number, number], y: [number, number]): THREE.BufferGeometry {
  const v = [
    [bx[0], y[0], bz[0]],
    [bx[1], y[0], bz[0]],
    [bx[1], y[0], bz[1]],
    [bx[0], y[0], bz[1]],
    [tx[0], y[1], tz[0]],
    [tx[1], y[1], tz[0]],
    [tx[1], y[1], tz[1]],
    [tx[0], y[1], tz[1]],
  ];
  const faces = [
    [0, 1, 2, 0, 2, 3], // bottom
    [4, 7, 6, 4, 6, 5], // top
    [0, 4, 5, 0, 5, 1], // back
    [3, 2, 6, 3, 6, 7], // front
    [0, 3, 7, 0, 7, 4], // left
    [1, 5, 6, 1, 6, 2], // right
  ].flat();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(faces.flatMap((i) => v[i]), 3));
  g.computeVertexNormals();
  return g;
}

const scaled = (r: readonly [number, number]): [number, number] => [r[0] * M, r[1] * M];

/** Geometry of one unit-local part: three x = along, y = height, z = depth into the room. */
function partGeometry(p: Part): THREE.BufferGeometry | null {
  switch (p.kind) {
    case "box":
      return boxGeometry(scaled(p.box.along), scaled(p.box.z), scaled(p.box.depth));
    case "taper":
      return taperGeometry(scaled(p.box.along), scaled(p.box.depth), scaled(p.top.along), scaled(p.top.depth), scaled(p.box.z));
    case "ring": {
      const r = p.radiusMm * M;
      const g = new THREE.RingGeometry(r - 0.009, r, 40);
      g.rotateX(-Math.PI / 2);
      g.translate(p.centre.along * M, p.centre.z * M, p.centre.depth * M);
      return normalise(g);
    }
    case "outline":
      return null;
  }
}

export interface UnitGeometry {
  meshes: { material: MaterialKey; geometry: THREE.BufferGeometry }[];
  edges: THREE.BufferGeometry | null;
  outlines: OutlinePart[];
}

function merge(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geoms.length === 1) return geoms[0];
  const merged = mergeGeometries(geoms);
  geoms.forEach((g) => g.dispose());
  return merged;
}

const unitCache = new Map<string, UnitGeometry>();

/**
 * Merged geometry per material for a unit's parts, plus one edge-line geometry. Cached by the
 * part list: four identical lofts share one entry. Entries are small and the set of distinct
 * units in a session is bounded, so they are kept for the session.
 */
export function unitGeometry(parts: Part[]): UnitGeometry {
  const key = JSON.stringify(parts);
  const hit = unitCache.get(key);
  if (hit) return hit;
  const byMaterial = new Map<MaterialKey, THREE.BufferGeometry[]>();
  const edgeSources: THREE.BufferGeometry[] = [];
  const outlines: OutlinePart[] = [];
  for (const p of parts) {
    if (p.kind === "outline") {
      outlines.push(p);
      continue;
    }
    const g = partGeometry(p);
    if (!g) continue;
    if ("edges" in p && p.edges) edgeSources.push(g.clone());
    byMaterial.set(p.material, [...(byMaterial.get(p.material) ?? []), g]);
  }
  let edges: THREE.BufferGeometry | null = null;
  if (edgeSources.length) {
    const src = merge(edgeSources);
    edges = new THREE.EdgesGeometry(src, 25);
    src.dispose();
  }
  const out: UnitGeometry = { meshes: [...byMaterial].map(([material, gs]) => ({ material, geometry: merge(gs) })), edges, outlines };
  unitCache.set(key, out);
  return out;
}

/** A world-mm box as three geometry. */
export function worldBoxGeometry(b: Box): THREE.BufferGeometry {
  return boxGeometry([b.minX * M, b.maxX * M], [b.minZ * M, b.maxZ * M], [b.minY * M, b.maxY * M]);
}

/** Merged geometry and edges for a set of room parts (owned by the caller: dispose both). */
export function roomPartsGeometry(parts: RoomPart[]): { geometry: THREE.BufferGeometry; edges: THREE.BufferGeometry } {
  const geometry = merge(parts.map((p) => worldBoxGeometry(p.box)));
  return { geometry, edges: new THREE.EdgesGeometry(geometry, 25) };
}

const pathFrom = <T extends THREE.Path>(pts: Point[], target: T): T => {
  pts.forEach((p, i) => (i === 0 ? target.moveTo(p.x * M, p.y * M) : target.lineTo(p.x * M, p.y * M)));
  target.closePath();
  return target;
};

/** A plan polygon (with holes) extruded between two heights, in world mm. Owned by the caller. */
export function extrudedGeometry(outline: Point[], holes: Point[][], bottomMm: number, topMm: number): THREE.BufferGeometry {
  const shape = pathFrom(outline, new THREE.Shape());
  for (const h of holes) shape.holes.push(pathFrom(h, new THREE.Path()));
  const g = new THREE.ExtrudeGeometry(shape, { depth: (topMm - bottomMm) * M, bevelEnabled: false });
  // Shape (x, y) -> three (x, 0, y); the extrusion then hangs down from `topMm`.
  g.rotateX(Math.PI / 2);
  g.translate(0, topMm * M, 0);
  return g;
}
