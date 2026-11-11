"use client";

// Level 1 3D view: display only (rotate, zoom, click to select). Everything comes from the store.

import { Edges, OrbitControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { catalogue, getFinish } from "@/domain/catalogue";
import { countertopOutline, placementToWorldBox, roomOutline, wallBoxToWorld, wallFrame } from "@/domain/geometry";
import type { Box, Placement, Point, Project, Rect } from "@/domain/types";
import { WALL_THICKNESS_MM, ZONES } from "@/domain/zones";
import { worldBoxes } from "@/store/project-store";

// World (x right, y down in plan, z up; mm) -> three (x, y up, z; metres).
const M = 1 / 1000;

/** A plan-view shape extruded upwards from `bottomMm` to `topMm`. */
function Extruded({ shape, bottomMm, topMm, color, opacity = 1 }: { shape: THREE.Shape; bottomMm: number; topMm: number; color: string; opacity?: number }) {
  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: (topMm - bottomMm) * M, bevelEnabled: false }),
    [shape, bottomMm, topMm],
  );
  // Rotating +90° about X maps shape (x, y) to three (x, 0, y) and extrudes towards -y,
  // so the mesh sits at the top and hangs down to the bottom.
  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, topMm * M, 0]}>
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} side={THREE.DoubleSide} />
      <Edges color="#555" />
    </mesh>
  );
}

const pathFrom = <T extends THREE.Path>(pts: Point[], target: T): T => {
  pts.forEach((p, i) => (i === 0 ? target.moveTo(p.x * M, p.y * M) : target.lineTo(p.x * M, p.y * M)));
  target.closePath();
  return target;
};

const rectPoints = (r: Rect): Point[] => [
  { x: r.minX, y: r.minY },
  { x: r.maxX, y: r.minY },
  { x: r.maxX, y: r.maxY },
  { x: r.minX, y: r.maxY },
];

function BoxMesh({
  box,
  color,
  opacity = 1,
  edges = "#222",
  onClick,
}: {
  box: Box;
  color: string;
  opacity?: number;
  edges?: string;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const size: [number, number, number] = [(box.maxX - box.minX) * M, (box.maxZ - box.minZ) * M, (box.maxY - box.minY) * M];
  const centre: [number, number, number] = [
    ((box.minX + box.maxX) / 2) * M,
    ((box.minZ + box.maxZ) / 2) * M,
    ((box.minY + box.maxY) / 2) * M,
  ];
  return (
    <mesh position={centre} onClick={onClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
      <Edges color={edges} />
    </mesh>
  );
}

function Room({ project }: { project: Project }) {
  const { room } = project;
  const { walls, floor } = useMemo(() => {
    const { inner, outer } = roomOutline(room, WALL_THICKNESS_MM);
    const wallShape = pathFrom(outer, new THREE.Shape());
    wallShape.holes.push(pathFrom(inner, new THREE.Path()));
    return { walls: wallShape, floor: pathFrom(inner, new THREE.Shape()) };
  }, [room]);

  const features = room.features.flatMap((f) => {
    if (f.kind === "window" || f.kind === "door") {
      const frame = wallFrame(room, f.wallId);
      const z: [number, number] = f.kind === "window" ? [f.sillMm, f.topMm] : [0, f.heightMm];
      const box = wallBoxToWorld(frame, { along: [f.offsetMm, f.offsetMm + f.widthMm], depth: [-110, 10], z });
      return [<BoxMesh key={f.id} box={box} color={f.kind === "window" ? "#bcdcf5" : "#b08560"} opacity={f.kind === "window" ? 0.45 : 1} />];
    }
    if (f.kind === "column") {
      const box = { minX: f.x, maxX: f.x + f.widthMm, minY: f.y, maxY: f.y + f.depthMm, minZ: 0, maxZ: room.ceilingHeightMm };
      return [<BoxMesh key={f.id} box={box} color="#bdbdbd" />];
    }
    if (f.kind === "beam") {
      const frame = wallFrame(room, f.wallId);
      const box = wallBoxToWorld(frame, { along: [0, frame.lengthMm], depth: [0, f.depthMm], z: [f.bottomMm, room.ceilingHeightMm] });
      return [<BoxMesh key={f.id} box={box} color="#bdbdbd" opacity={0.6} />];
    }
    return [];
  });

  return (
    <>
      <Extruded shape={floor} bottomMm={-20} topMm={0} color="#e8e4dc" />
      <Extruded shape={walls} bottomMm={0} topMm={room.ceilingHeightMm} color="#d9d6d0" opacity={0.25} />
      {features}
    </>
  );
}

function Countertop({ project }: { project: Project }) {
  const shapes = useMemo(() => {
    const { slabs, cutOuts } = countertopOutline(project, catalogue);
    return slabs.map((slab) => {
      const shape = pathFrom(rectPoints(slab.rect), new THREE.Shape());
      for (const c of cutOuts) {
        const inside = c.rect.minX >= slab.rect.minX && c.rect.maxX <= slab.rect.maxX && c.rect.minY >= slab.rect.minY && c.rect.maxY <= slab.rect.maxY;
        if (inside) shape.holes.push(pathFrom(rectPoints(c.rect), new THREE.Path()));
      }
      return { key: `${slab.wallId}-${slab.rect.minX}-${slab.rect.minY}`, shape };
    });
  }, [project]);
  return (
    <>
      {shapes.map(({ key, shape }) => (
        <Extruded key={key} shape={shape} bottomMm={ZONES.countertop.bottom} topMm={ZONES.countertop.top} color="#2b2b2b" />
      ))}
    </>
  );
}

type OrbitControlsImpl = React.ComponentRef<typeof OrbitControls>;

const ACCENT = "#7153b5";
const BAD = "#c2412d";

export interface SceneApi {
  rotate: (radians: number) => void;
  zoom: (factor: number) => void;
  reset: () => void;
}

/** Camera framing for a room: looking in from the front-left, above. */
function home(project: Project) {
  const { inner } = roomOutline(project.room, 0);
  const xs = inner.map((p) => p.x);
  const ys = inner.map((p) => p.y);
  const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 1600;
  const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 1200;
  const span = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 3200;
  const target = new THREE.Vector3(cx * M, 1.0, cy * M);
  // Orthographic, isometric-ish: direction matters, distance only has to clear the room.
  return { target, position: target.clone().add(new THREE.Vector3(-6, 7.5, 9)), spanM: (span + 1200) * M };
}

/** Orthographic zoom (pixels per metre) that fits the room in the panel. */
const fitZoom = (size: { width: number; height: number }, spanM: number) => Math.min(size.width, size.height * 1.15) / (spanM * 1.25);

const CameraRig = forwardRef<SceneApi, { project: Project }>(function CameraRig({ project }, ref) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const initial = useMemo(() => home(project), [project.room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit on first layout and whenever the panel resizes.
  useEffect(() => {
    camera.zoom = fitZoom(size, initial.spanM);
    camera.updateProjectionMatrix();
  }, [camera, size, initial.spanM]);

  useImperativeHandle(ref, () => ({
    rotate: (radians) => {
      const c = controls.current;
      if (!c) return;
      const offset = camera.position.clone().sub(c.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
      camera.position.copy(c.target).add(offset);
      c.update();
    },
    zoom: (factor) => {
      camera.zoom = Math.min(600, Math.max(20, camera.zoom * factor));
      camera.updateProjectionMatrix();
      controls.current?.update();
    },
    reset: () => {
      const c = controls.current;
      if (!c) return;
      camera.position.copy(initial.position);
      c.target.copy(initial.target);
      camera.zoom = fitZoom(size, initial.spanM);
      camera.updateProjectionMatrix();
      c.update();
    },
  }));

  return <OrbitControls ref={controls} makeDefault target={initial.target} minZoom={20} maxZoom={600} maxPolarAngle={Math.PI / 2.05} />;
});

export interface KitchenSceneProps {
  project: Project;
  selectedId: string | null;
  blockedIds: Set<string>;
  /** A unit being dragged, shown as a translucent box (green fits, red blocked). */
  ghost?: { placement: Placement; ok: boolean } | null;
  onSelect?: (id: string) => void;
}

export const KitchenScene = forwardRef<SceneApi, KitchenSceneProps>(function KitchenScene(
  { project, selectedId, blockedIds, ghost, onSelect },
  ref,
) {
  const boxes = useMemo(() => worldBoxes(project), [project]);
  const initial = useMemo(() => home(project), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ghostBox = useMemo(() => {
    if (!ghost) return null;
    try {
      return placementToWorldBox(project, ghost.placement, catalogue);
    } catch {
      return null;
    }
  }, [project, ghost]);

  /** Fitted appliances select their host. */
  const selectable = (id: string) => {
    const a = project.appliances.find((x) => x.id === id);
    return a?.kind === "hosted" ? a.hostPlacementId : id;
  };
  const colourFor = (id: string) => {
    if (blockedIds.has(id)) return "#e9a395";
    const mod = project.modules.find((m) => m.id === id);
    if (mod) return getFinish(catalogue, mod.finishId).hex;
    return "#9aa3ad"; // appliances: brushed steel
  };

  return (
    <Canvas orthographic camera={{ position: initial.position.toArray(), zoom: 80, near: 0.1, far: 100 }} dpr={[1, 2]}>
      <color attach="background" args={["#f1efeb"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 6, 4]} intensity={1.1} />
      <Room project={project} />
      {[...boxes].map(([id, box]) => {
        const sel = selectable(id) === selectedId;
        return (
          <BoxMesh
            key={id}
            box={box}
            color={colourFor(id)}
            edges={blockedIds.has(id) ? BAD : sel ? ACCENT : "#222"}
            onClick={
              onSelect &&
              ((e) => {
                e.stopPropagation();
                onSelect(selectable(id));
              })
            }
          />
        );
      })}
      {/* Selected unit: an accent shell just outside its box. */}
      {selectedId && boxes.get(selectedId) && (
        <BoxMesh box={grow(boxes.get(selectedId)!, 12)} color={ACCENT} opacity={0.22} edges={ACCENT} />
      )}
      {/* Blind sections of corner units, shaded so the blind side is visible. */}
      {[...boxes].flatMap(([id, box]) =>
        box.blindPart ? [<BoxMesh key={`${id}-blind`} box={{ ...box.blindPart, maxZ: box.blindPart.maxZ + 5 }} color="#000" opacity={0.25} />] : [],
      )}
      {ghostBox && <BoxMesh box={grow(ghostBox, 6)} color={ghost!.ok ? "#439c5b" : BAD} opacity={0.35} edges={ghost!.ok ? "#439c5b" : BAD} />}
      <Countertop project={project} />
      <CameraRig ref={ref} project={project} />
    </Canvas>
  );
});

function grow(b: Box, d: number): Box {
  return { minX: b.minX - d, maxX: b.maxX + d, minY: b.minY - d, maxY: b.maxY + d, minZ: b.minZ - d, maxZ: b.maxZ + d };
}
