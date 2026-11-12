"use client";

// Outlines drawn over units (hover, selected, blocked) and the drag ghost.

import { Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Box } from "@/domain/types";
import { M } from "./materials";

export const ACCENT = "#7153b5";
const ACCENT_LIGHT = "#b7a6e0";
export const BAD = "#c2412d";
const OK = "#3f9a57";

const noRaycast = () => null;

/** The 12 edges of a box as line segment pairs, in three metres. */
function boxSegments(b: Box): [number, number, number][] {
  const x = [b.minX * M, b.maxX * M];
  const y = [b.minZ * M, b.maxZ * M];
  const z = [b.minY * M, b.maxY * M];
  const c = (i: number, j: number, k: number): [number, number, number] => [x[i], y[j], z[k]];
  return [
    [c(0, 0, 0), c(1, 0, 0)],
    [c(1, 0, 0), c(1, 0, 1)],
    [c(1, 0, 1), c(0, 0, 1)],
    [c(0, 0, 1), c(0, 0, 0)],
    [c(0, 1, 0), c(1, 1, 0)],
    [c(1, 1, 0), c(1, 1, 1)],
    [c(1, 1, 1), c(0, 1, 1)],
    [c(0, 1, 1), c(0, 1, 0)],
    [c(0, 0, 0), c(0, 1, 0)],
    [c(1, 0, 0), c(1, 1, 0)],
    [c(1, 0, 1), c(1, 1, 1)],
    [c(0, 0, 1), c(0, 1, 1)],
  ].flat();
}

export function grow(b: Box, d: number): Box {
  return { minX: b.minX - d, maxX: b.maxX + d, minY: b.minY - d, maxY: b.maxY + d, minZ: b.minZ - d, maxZ: b.maxZ + d };
}

const shellGeometry = new THREE.BoxGeometry(1, 1, 1);

function Shell({ box, color, opacity }: { box: Box; color: string; opacity: number }) {
  return (
    <mesh
      geometry={shellGeometry}
      position={[((box.minX + box.maxX) / 2) * M, ((box.minZ + box.maxZ) / 2) * M, ((box.minY + box.maxY) / 2) * M]}
      scale={[(box.maxX - box.minX) * M, (box.maxZ - box.minZ) * M, (box.maxY - box.minY) * M]}
      raycast={noRaycast}
      renderOrder={2}
    >
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

export function UnitOutline({ box, kind, shell = true }: { box: Box; kind: "hover" | "selected" | "blocked"; shell?: boolean }) {
  // Grown so the outline clears the 18 mm fronts and handles; the selection sits outside a red one.
  const b = useMemo(() => grow(box, kind === "selected" ? 45 : 30), [box, kind]);
  const points = useMemo(() => boxSegments(b), [b]);
  const color = kind === "blocked" ? BAD : kind === "selected" ? ACCENT : ACCENT_LIGHT;
  return (
    <>
      {kind === "blocked" && <Shell box={b} color={BAD} opacity={0.3} />}
      {kind === "selected" && shell && <Shell box={b} color={ACCENT} opacity={0.12} />}
      <Line points={points} segments color={color} lineWidth={kind === "hover" ? 1.5 : 2.5} raycast={noRaycast} renderOrder={3} depthTest={kind !== "hover"} />
    </>
  );
}

export interface SceneGhost {
  box: Box;
  ok: boolean;
}

/**
 * The drag ghost: one translucent box, built once and moved per update without re-rendering.
 * `subscribe` delivers the ghost's world box (or null) whenever it changes.
 */
export function GhostBox({ subscribe }: { subscribe: (cb: (g: SceneGhost | null) => void) => () => void }) {
  const mesh = useRef<THREE.Mesh>(null);
  const lines = useRef<THREE.LineSegments>(null);
  const invalidate = useThree((s) => s.invalidate);
  const { material, edgeGeometry, lineMaterial } = useMemo(
    () => ({
      material: new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.35, depthWrite: false }),
      edgeGeometry: new THREE.EdgesGeometry(shellGeometry),
      lineMaterial: new THREE.LineBasicMaterial({ color: OK }),
    }),
    [],
  );

  useEffect(() => {
    const unsubscribe = subscribe((g) => {
      for (const o of [mesh.current, lines.current]) {
        if (!o) continue;
        o.visible = g !== null;
        if (!g) continue;
        const b = grow(g.box, 6);
        o.position.set(((b.minX + b.maxX) / 2) * M, ((b.minZ + b.maxZ) / 2) * M, ((b.minY + b.maxY) / 2) * M);
        o.scale.set((b.maxX - b.minX) * M, (b.maxZ - b.minZ) * M, (b.maxY - b.minY) * M);
      }
      if (g) {
        material.color.set(g.ok ? OK : BAD);
        lineMaterial.color.set(g.ok ? OK : BAD);
      }
      invalidate();
    });
    return () => {
      unsubscribe();
      material.dispose();
      edgeGeometry.dispose();
      lineMaterial.dispose();
    };
  }, [subscribe, invalidate, material, edgeGeometry, lineMaterial]);

  return (
    <>
      <mesh ref={mesh} geometry={shellGeometry} material={material} visible={false} raycast={noRaycast} renderOrder={4} />
      <lineSegments ref={lines} geometry={edgeGeometry} material={lineMaterial} visible={false} raycast={noRaycast} />
    </>
  );
}
