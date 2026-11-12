"use client";

// Floor, walls (split around openings), window frames and panes, column, beam and duct box.
// In Full height the walls between the camera and the room fade to 15%.

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import { roomModel, type RoomPart, type WallHeightMode } from "@/domain/three-model";
import type { Room } from "@/domain/types";
import { edgeMaterial, extrudedGeometry, fadingEdgeMaterial, fadingMaterial, materialFor, roomPartsGeometry } from "./materials";

const FADED = 0.15;
/** How directly the camera must look through a wall (cosine) before it fades. */
const FADE_COS = 0.25;

const noRaycast = () => null;

interface Group {
  key: string;
  wallId: string | null;
  material: THREE.Material;
  edges: THREE.LineBasicMaterial | null;
  geometry: THREE.BufferGeometry;
  edgeGeometry: THREE.BufferGeometry;
}

export const RoomMesh = memo(function RoomMesh({ room, mode }: { room: Room; mode: WallHeightMode }) {
  const model = useMemo(() => roomModel(room, mode), [room, mode]);

  const floor = useMemo(() => extrudedGeometry(model.floor, [], -20, 0), [model]);
  const groups = useMemo(() => {
    // One merged mesh per (wall, material); parts that don't belong to a wall never fade.
    const byKey = new Map<string, RoomPart[]>();
    for (const p of [...model.walls, ...model.parts]) {
      const k = `${p.wallId ?? ""}|${p.material}`;
      byKey.set(k, [...(byKey.get(k) ?? []), p]);
    }
    return [...byKey].map(([key, parts]): Group => {
      const wallId = parts[0].wallId ?? null;
      const { geometry, edges } = roomPartsGeometry(parts);
      const fades = wallId !== null && mode === "full";
      return {
        key,
        wallId: fades ? wallId : null,
        material: fades ? fadingMaterial(parts[0].material, wallId) : materialFor(parts[0].material),
        edges: parts[0].material === "pane" ? null : fades ? fadingEdgeMaterial(wallId) : edgeMaterial,
        geometry,
        edgeGeometry: edges,
      };
    });
  }, [model, mode]);

  useEffect(
    () => () => {
      floor.dispose();
      groups.forEach((g) => {
        g.geometry.dispose();
        g.edgeGeometry.dispose();
      });
    },
    [floor, groups],
  );

  // Fade the walls the camera looks through. Runs only on rendered frames (frameloop="demand").
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (mode !== "full") return;
    camera.getWorldDirection(dir);
    const len = Math.hypot(dir.x, dir.z) || 1;
    for (const g of groups) {
      if (!g.wallId) continue;
      const n = model.normals[g.wallId];
      // Looking along the wall's inward normal means the wall is between camera and room.
      const through = (dir.x * n.x + dir.z * n.y) / len > FADE_COS;
      const m = g.material as THREE.MeshStandardMaterial;
      const base = (m.userData.baseOpacity as number) ?? 1;
      const opacity = through ? Math.min(base, FADED) : base;
      if (m.opacity !== opacity) {
        m.opacity = opacity;
        m.depthWrite = opacity >= 1;
      }
      if (g.edges) g.edges.opacity = (g.edges.userData.baseOpacity as number) * (through ? FADED : 1);
    }
  });

  return (
    <>
      <mesh geometry={floor} material={materialFor("floor")} raycast={noRaycast} />
      {groups.map((g) => (
        <group key={g.key}>
          <mesh geometry={g.geometry} material={g.material} raycast={noRaycast} />
          {g.edges && <lineSegments geometry={g.edgeGeometry} material={g.edges} raycast={noRaycast} />}
        </group>
      ))}
    </>
  );
});
