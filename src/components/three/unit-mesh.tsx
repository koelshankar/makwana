"use client";

// One memoised component per placement: it re-renders only when its own placement object (Immer
// keeps unchanged ones referentially equal), its fitted appliances or its position change.

import type { ThreeEvent } from "@react-three/fiber";
import { memo, useMemo } from "react";
import * as THREE from "three";
import { catalogue, getAppliance } from "@/domain/catalogue";
import { applianceParts, fittedParts, unitParts, type OutlinePart, type Part } from "@/domain/three-model";
import type { ModulePlacement } from "@/domain/types";
import { edgeMaterial, M, materialFor, unitGeometry } from "./materials";

/** Where a unit's local origin sits in three space, and its heading about the vertical. */
export interface Pose {
  x: number;
  z: number;
  angle: number;
}

export interface PickHandlers {
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
}

const noRaycast = () => null;

/** A text label drawn once to a canvas texture: no DOM overlay, cached per text. */
const labels = new Map<string, THREE.SpriteMaterial>();
function labelMaterial(text: string): THREE.SpriteMaterial {
  let m = labels.get(text);
  if (!m) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 100;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.roundRect(4, 14, 504, 72, 14);
    ctx.fill();
    ctx.fillStyle = "#4a4743";
    ctx.font = "500 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 52);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    labels.set(text, m);
  }
  return m;
}

const dashed = new THREE.LineDashedMaterial({ color: "#5d5a55", dashSize: 0.06, gapSize: 0.04 });

function Outline({ part }: { part: OutlinePart }) {
  const geometry = useMemo(() => {
    const { along, depth, z } = part.box;
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry((along[1] - along[0]) * M, (z[1] - z[0]) * M, (depth[1] - depth[0]) * M));
    g.translate(((along[0] + along[1]) / 2) * M, ((z[0] + z[1]) / 2) * M, ((depth[0] + depth[1]) / 2) * M);
    return g;
  }, [part]);
  const { along, depth, z } = part.box;
  return (
    <>
      <lineSegments geometry={geometry} material={dashed} onUpdate={(l) => l.computeLineDistances()} raycast={noRaycast} />
      <sprite
        material={labelMaterial(part.label)}
        position={[((along[0] + along[1]) / 2) * M, ((z[0] + z[1]) / 2) * M, depth[1] * M]}
        scale={[0.9, 0.18, 1]}
        raycast={noRaycast}
      />
    </>
  );
}

/** The meshes for a part list, posed on its wall. */
function Parts({ id, parts, pose, onSelect, onHover }: { id: string; parts: Part[]; pose: Pose } & PickHandlers) {
  const g = useMemo(() => unitGeometry(parts), [parts]);
  const events = onSelect
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(id);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover?.(id);
        },
        onPointerOut: () => onHover?.(null),
      }
    : {};
  return (
    <group position={[pose.x, 0, pose.z]} rotation={[0, pose.angle, 0]} {...events}>
      {g.meshes.map((m) => (
        <mesh key={m.material} geometry={m.geometry} material={materialFor(m.material)} />
      ))}
      {g.edges && <lineSegments geometry={g.edges} material={edgeMaterial} raycast={noRaycast} />}
      {g.outlines.map((o) => (
        <Outline key={o.key} part={o} />
      ))}
    </group>
  );
}

export const UnitMesh = memo(function UnitMesh({
  placement,
  hosted,
  pose,
  ...handlers
}: {
  placement: ModulePlacement;
  /** Fitted appliance ids, comma-joined so the prop stays a primitive. */
  hosted: string;
  pose: Pose;
} & PickHandlers) {
  const parts = useMemo(() => unitParts(placement, catalogue, hosted ? hosted.split(",") : []), [placement, hosted]);
  return <Parts id={placement.id} parts={parts} pose={pose} {...handlers} />;
}, samePose);

export const ApplianceMesh = memo(function ApplianceMesh({
  id,
  applianceId,
  baseFinishId,
  pose,
  ...handlers
}: { id: string; applianceId: string; baseFinishId: string; pose: Pose } & PickHandlers) {
  const parts = useMemo(() => applianceParts(getAppliance(catalogue, applianceId), baseFinishId), [applianceId, baseFinishId]);
  return <Parts id={id} parts={parts} pose={pose} {...handlers} />;
}, samePose);

/** A sink, hob, oven or microwave fitted in a host: posed with the host, but picked on its own. */
export const FittedMesh = memo(function FittedMesh({
  id,
  applianceId,
  host,
  pose,
  ...handlers
}: { id: string; applianceId: string; host: ModulePlacement; pose: Pose } & PickHandlers) {
  const parts = useMemo(() => fittedParts(host, catalogue, applianceId), [host, applianceId]);
  return <Parts id={id} parts={parts} pose={pose} {...handlers} />;
}, samePose);

/** Shallow props comparison, except poses compare by value. */
function samePose<P extends { pose: Pose }>(a: P, b: P): boolean {
  for (const k of Object.keys(a) as (keyof P)[]) {
    if (k === "pose") continue;
    if (a[k] !== b[k]) return false;
  }
  return a.pose.x === b.pose.x && a.pose.z === b.pose.z && a.pose.angle === b.pose.angle && Object.keys(a).length === Object.keys(b).length;
}
