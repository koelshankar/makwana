"use client";

// Level 1 3D view: cabinets, countertop, appliances and walls in their finish colours, which
// can be rotated and zoomed. Display only (click to select, no dragging). Everything comes from
// the project passed in; the meshes are built from src/domain/three-model.ts.

import { ContactShadows } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { forwardRef, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { catalogue } from "@/domain/catalogue";
import { inheritedFinish } from "@/domain/finish-defaults";
import { roomOutline, wallFrames, wallToWorld, type WallFrame } from "@/domain/geometry";
import { countertopModel, type WallHeightMode } from "@/domain/three-model";
import type { Project } from "@/domain/types";
import { ZONES } from "@/domain/zones";
import { worldBoxes } from "@/store/project-store";
import { CameraRig, type SceneApi } from "./camera-rig";
import { edgeMaterial, extrudedGeometry, M, materialFor, setEdgeLines } from "./materials";
import { GhostBox, UnitOutline, type SceneGhost } from "./overlays";
import { RoomMesh } from "./room-mesh";
import { SceneEvents } from "./scene-boundary";
import { ApplianceMesh, FittedMesh, UnitMesh, type Pose } from "./unit-mesh";

export type { SceneApi, ViewPreset } from "./camera-rig";
export type { SceneGhost } from "./overlays";

const BACKGROUND = "#f1efeb";

// React Three Fiber 9 still creates a THREE.Clock, which three r183+ reports as deprecated once
// per canvas. Drop that one message (nothing we can change here); pass everything else through.
THREE.setConsoleFunction((type, message, ...params) => {
  if (message.startsWith("THREE.Clock: This module has been deprecated")) return;
  console[type](message, ...params);
});

const poseOf = (frame: WallFrame, offsetMm: number): Pose => {
  const o = wallToWorld(frame, offsetMm, 0);
  return { x: o.x * M, z: o.y * M, angle: Math.atan2(-frame.u.y, frame.u.x) };
};

const Countertop = memo(function Countertop({ project }: { project: Project }) {
  const slabs = useMemo(() => countertopModel(project, catalogue), [project]);
  // Rebuild only when the outline itself changes, not on every project edit.
  const signature = JSON.stringify(slabs);
  const built = useMemo(
    () =>
      slabs.map((s) => {
        const geometry = extrudedGeometry(s.outline, s.holes, ZONES.countertop.bottom, ZONES.countertop.top);
        return { key: s.key, geometry, edges: new THREE.EdgesGeometry(geometry, 25) };
      }),
    [signature], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(
    () => () =>
      built.forEach((b) => {
        b.geometry.dispose();
        b.edges.dispose();
      }),
    [built],
  );
  return (
    <>
      {built.map((b) => (
        <group key={b.key}>
          <mesh geometry={b.geometry} material={materialFor("countertop")} />
          <lineSegments geometry={b.edges} material={edgeMaterial} raycast={() => null} />
        </group>
      ))}
    </>
  );
});

/** Soft contact shadows under the cabinets, re-rendered only when the project changes. */
function Shadows({ project }: { project: Project }) {
  const { centre, span } = useMemo(() => {
    const { inner } = roomOutline(project.room, 0);
    const xs = inner.map((p) => p.x);
    const ys = inner.map((p) => p.y);
    return {
      centre: [((Math.min(...xs) + Math.max(...xs)) / 2) * M, 0.002, ((Math.min(...ys) + Math.max(...ys)) / 2) * M] as [number, number, number],
      span: (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 400) * M,
    };
  }, [project.room]);
  const version = useVersion(project);
  return <ContactShadows key={version} position={centre} scale={span} resolution={512} blur={2.4} opacity={0.42} far={2.2} frames={1} color="#2a2018" />;
}

/** A counter that changes whenever `value` does (keys the shadows' one-off render). */
function useVersion(value: unknown): number {
  const [state, setState] = useState({ value, version: 0 });
  if (state.value !== value) setState({ value, version: state.version + 1 });
  return state.value === value ? state.version : state.version + 1;
}

/** Edge lines on or off for performance mode, then one re-render. */
function EdgeLines({ on }: { on: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    setEdgeLines(on);
    invalidate();
  }, [on, invalidate]);
  return null;
}

/** Re-renders once whenever the inputs change (frameloop="demand"). */
function Invalidate({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), deps); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export interface KitchenSceneProps {
  project: Project;
  selectedId: string | null;
  blockedIds: Set<string>;
  wallHeight?: WallHeightMode;
  /** The wall the "Facing active wall" preset looks at. */
  activeWallId?: string | null;
  /** Clicking and hovering units; off in the customer view. */
  interactive?: boolean;
  /** Delivers the drag ghost's world box whenever it changes; the ghost is moved, not re-rendered. */
  subscribeGhost?: (cb: (g: SceneGhost | null) => void) => () => void;
  onSelect?: (id: string) => void;
  /** Performance mode: device pixel ratio 1, no contact shadows, no edge lines. */
  performance?: boolean;
  /** Called when frames stay slow while the view is being orbited (see CameraRig). */
  onSlowFrames?: () => void;
}

export const KitchenScene = forwardRef<SceneApi, KitchenSceneProps>(function KitchenScene(
  { project, selectedId, blockedIds, wallHeight = "cut", activeWallId, interactive = true, subscribeGhost, onSelect, performance = false, onSlowFrames },
  ref,
) {
  const frames = useMemo(() => new Map(wallFrames(project.room).map((f) => [f.wallId, f])), [project.room]);
  const boxes = useMemo(() => worldBoxes(project), [project]);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Stable handlers so memoised units never re-render because of them.
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  });
  const handleSelect = useCallback((id: string) => selectRef.current?.(id), []);
  const handleHover = useCallback((id: string | null) => setHoverId(id), []);
  const handlers = interactive && onSelect ? { onSelect: handleSelect, onHover: handleHover } : {};

  /** Fitted appliance ids per host, as primitive strings. */
  const hosted = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of project.appliances) if (a.kind === "hosted") m.set(a.hostPlacementId, [...(m.get(a.hostPlacementId) ?? []), a.applianceId]);
    return new Map([...m].map(([k, v]) => [k, v.sort().join(",")]));
  }, [project.appliances]);
  const baseFinishId = useMemo(() => inheritedFinish(project, catalogue, "B600").finishId, [project]);

  const selected = selectedId;
  const hover = interactive && hoverId && hoverId !== selected ? hoverId : null;

  // WebGL context loss mid-session (GPU reset, driver update): tell the boundary, which shows the
  // "3D view isn't available" panel while it is lost. On restore three.js rebuilds its GPU state in
  // this same canvas (its own listener runs first, added when the renderer was made); the count
  // below re-renders the scene, which redraws the frame (frameloop "demand") and the contact
  // shadows (drei renders them again after each re-render). No remount: a remount would dispose
  // objects from before the loss and log WebGL "object does not belong to this context" warnings.
  const [restores, setRestores] = useState(0);
  const report = useContext(SceneEvents);
  const reportRef = useRef(report);
  useEffect(() => {
    reportRef.current = report;
  });
  const detachContextEvents = useRef<(() => void) | null>(null);
  useEffect(() => () => detachContextEvents.current?.(), []);
  const onCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    detachContextEvents.current?.();
    const canvas = gl.domElement;
    canvas.setAttribute("data-scene-ready", ""); // The renderer is up (end-to-end tests wait for it).
    const lost = () => reportRef.current?.("context-lost");
    const restored = () => {
      reportRef.current?.("context-restored");
      setRestores((n) => n + 1);
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    detachContextEvents.current = () => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, []);

  return (
    <Canvas
      orthographic
      frameloop="demand"
      dpr={performance ? 1 : [1, 2]}
      camera={{ position: [-8, 9, 12], zoom: 80, near: 0.05, far: 100 }}
      gl={{ antialias: true }}
      onPointerMissed={() => setHoverId(null)}
      onCreated={onCreated}
      data-scene
    >
      <color attach="background" args={[BACKGROUND]} />
      <hemisphereLight args={["#ffffff", "#d6ccbe", 2.6]} />
      <directionalLight position={[-5, 8, 3]} intensity={1.5} />
      <RoomMesh room={project.room} mode={wallHeight} />
      {project.modules.map((p) => {
        const f = frames.get(p.wallId);
        return f ? <UnitMesh key={p.id} placement={p} hosted={hosted.get(p.id) ?? ""} pose={poseOf(f, p.offsetMm)} {...handlers} /> : null;
      })}
      {project.appliances.map((a) => {
        if (a.kind === "hosted") {
          const host = project.modules.find((m) => m.id === a.hostPlacementId);
          const f = host && frames.get(host.wallId);
          return host && f ? <FittedMesh key={a.id} id={a.id} applianceId={a.applianceId} host={host} pose={poseOf(f, host.offsetMm)} {...handlers} /> : null;
        }
        const f = frames.get(a.wallId);
        return f ? <ApplianceMesh key={a.id} id={a.id} applianceId={a.applianceId} baseFinishId={baseFinishId} pose={poseOf(f, a.offsetMm)} {...handlers} /> : null;
      })}
      <Countertop project={project} />
      {!performance && <Shadows project={project} />}
      <EdgeLines on={!performance} />
      {interactive &&
        [...blockedIds].map((id) => {
          const box = boxes.get(id);
          return box ? <UnitOutline key={`b-${id}`} box={box} kind="blocked" /> : null;
        })}
      {interactive && selected && boxes.get(selected) && <UnitOutline box={boxes.get(selected)!} kind="selected" shell={!blockedIds.has(selected)} />}
      {hover && boxes.get(hover) && <UnitOutline box={boxes.get(hover)!} kind="hover" />}
      {subscribeGhost && <GhostBox subscribe={subscribeGhost} />}
      <Invalidate deps={[project, selected, hover, blockedIds, wallHeight, interactive, performance, restores]} />
      <CameraRig ref={ref} room={project.room} boxes={boxes} activeWallId={activeWallId} onSlowFrames={onSlowFrames} />
    </Canvas>
  );
});
