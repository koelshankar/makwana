"use client";

// Wall letters (A, B, ...) lying on the floor in front of each wall's base, in the Design 3D view
// only. Drawn from a canvas texture (no web font to fetch), one cached texture per letter. Each
// letter turns about the vertical to read upright from the camera, whichever way it looks.

import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { wallLabelSpots } from "@/domain/three-model";
import type { Room } from "@/domain/types";
import { M } from "./materials";

const SIZE_MM = 340;
const PX = 128;
const materials = new Map<string, THREE.MeshBasicMaterial>();

function labelMaterial(letter: string): THREE.MeshBasicMaterial {
  let m = materials.get(letter);
  if (m) return m;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(PX / 2, PX / 2, PX / 2 - 6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#2a2826";
  ctx.stroke();
  ctx.fillStyle = "#2a2826";
  ctx.font = `600 ${PX * 0.56}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, PX / 2, PX / 2 + PX * 0.03);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  m = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  materials.set(letter, m);
  return m;
}

const plane = new THREE.PlaneGeometry(SIZE_MM * M, SIZE_MM * M);
const noRaycast = () => null;

export const WallLabels = memo(function WallLabels({ room }: { room: Room }) {
  const spots = useMemo(() => wallLabelSpots(room), [room]);
  const gl = useThree((s) => s.gl);
  const turn = useRef<THREE.Group>(null);
  // For end-to-end tests: which labels are drawn.
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.dataset.wallLabels = spots.map((s) => s.wallId).join(",");
    return () => {
      delete canvas.dataset.wallLabels;
    };
  }, [gl, spots]);

  // The letters' tops point the way the camera looks (in plan), so they read upright on screen.
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldDirection(dir);
    if (Math.hypot(dir.x, dir.z) < 1e-6) return;
    const angle = Math.atan2(-dir.x, -dir.z);
    for (const g of turn.current?.children ?? []) g.rotation.y = angle;
  });

  return (
    <group ref={turn}>
      {spots.map((s) => (
        <group key={s.wallId} position={[s.at.x * M, 0.004, s.at.y * M]}>
          <mesh geometry={plane} material={labelMaterial(s.wallId)} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1} />
        </group>
      ))}
    </group>
  );
});
