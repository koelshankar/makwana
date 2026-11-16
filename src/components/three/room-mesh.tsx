"use client";

// Floor, walls (split around openings), window frames and panes, column, beam and duct box.
// In Full height the walls between the camera and the room fade to 15%; in Auto they are hidden
// (the units on them stay). Decided before every render from the camera doing the rendering, so
// orbiting, presets and the PDF snapshot all see the right walls.

import { useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { roomModel, wallsInFront, type RoomPart, type WallHeightMode } from "@/domain/three-model";
import type { Room } from "@/domain/types";
import { edgeMaterial, extrudedGeometry, fadingEdgeMaterial, fadingMaterial, materialFor, roomPartsGeometry } from "./materials";

const FADED = 0.15;

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
      // Full height fades by opacity (per-wall materials); Auto hides the group, so shares materials.
      const fades = wallId !== null && mode === "full";
      return {
        key,
        wallId: mode === "cut" ? null : wallId,
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

  // Fade or hide the walls the camera looks through, before each render (scene.onBeforeRender runs
  // before three culls and sorts, for every gl.render: frames, the contact shadows and snapshots).
  const scene = useThree((s) => s.scene);
  const get = useThree((s) => s.get);
  const objects = useRef(new Map<string, THREE.Group>());
  useEffect(() => {
    const canvas = get().gl.domElement;
    const shown = objects.current;
    canvas.dataset.wallMode = mode;
    if (mode === "cut") {
      delete canvas.dataset.hiddenWalls;
      return;
    }
    const dir = new THREE.Vector3();
    const prev = scene.onBeforeRender;
    const apply = (camera: THREE.Camera) => {
      camera.getWorldDirection(dir);
      const through = new Set(wallsInFront(model, { x: dir.x, y: dir.z }));
      for (const g of groups) {
        if (!g.wallId) continue;
        const inFront = through.has(g.wallId);
        if (mode === "auto") {
          const obj = shown.get(g.key);
          if (obj) obj.visible = !inFront;
          continue;
        }
        const m = g.material as THREE.MeshStandardMaterial;
        const base = (m.userData.baseOpacity as number) ?? 1;
        const opacity = inFront ? Math.min(base, FADED) : base;
        if (m.opacity !== opacity) {
          m.opacity = opacity;
          m.depthWrite = opacity >= 1;
        }
        if (g.edges) g.edges.opacity = (g.edges.userData.baseOpacity as number) * (inFront ? FADED : 1);
      }
      // For end-to-end tests: the walls hidden or faded for the view camera.
      if (camera === get().camera) canvas.dataset.hiddenWalls = [...through].sort().join(",");
    };
    scene.onBeforeRender = function (this: THREE.Scene, ...args: Parameters<THREE.Scene["onBeforeRender"]>) {
      prev.apply(this, args);
      apply(args[2]);
    };
    get().invalidate();
    return () => {
      scene.onBeforeRender = prev;
      for (const obj of shown.values()) obj.visible = true;
    };
  }, [scene, get, groups, model, mode]);

  return (
    <>
      <mesh geometry={floor} material={materialFor("floor")} raycast={noRaycast} />
      {groups.map((g) => (
        <group
          key={g.key}
          ref={(obj) => {
            if (obj) objects.current.set(g.key, obj);
            else objects.current.delete(g.key);
          }}
        >
          <mesh geometry={g.geometry} material={g.material} raycast={noRaycast} />
          {g.edges && <lineSegments geometry={g.edgeGeometry} material={g.edges} raycast={noRaycast} />}
        </group>
      ))}
    </>
  );
});
