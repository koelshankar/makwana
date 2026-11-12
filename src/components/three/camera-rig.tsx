"use client";

// Orthographic camera and orbit controls. The room is fitted on first load and on Reset view
// only: once the user has rotated or zoomed, panel resizes just change the frustum's aspect
// (R3F does that for orthographic cameras) and keep their view.

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { LAYER_DEPTH_MM, roomOutline, wallBoxToWorld, wallFrames, wallToWorld } from "@/domain/geometry";
import type { Anchor, Box, Layer, Room } from "@/domain/types";
import { ZONES } from "@/domain/zones";
import { M } from "./materials";

type OrbitControlsImpl = React.ComponentRef<typeof OrbitControls>;

export type ViewPreset = "3d" | "top" | "wall";

export interface FrameTarget {
  placementIds: string[];
  /** Used when no placement is given (gaps, corners). */
  anchor?: Anchor;
}

export interface SceneApi {
  /** Quarter turn around the room centre, animated. 1 = clockwise seen from above. */
  rotate: (direction: 1 | -1) => void;
  zoom: (factor: number) => void;
  reset: () => void;
  preset: (p: ViewPreset) => void;
  /** Animates to these units (or a wall region), keeping the viewing direction; no whole-room refit. */
  frame: (target: FrameTarget) => void;
  /**
   * A PNG of the room at the iso preset, whatever the current view: renders and reads the canvas in
   * the same frame, then puts the camera back.
   */
  snapshot: () => string;
}

const BAND: Record<Layer, [number, number]> = {
  base: [0, ZONES.countertop.top],
  wall: [ZONES.wall.bottom, ZONES.wall.top],
  loft: [ZONES.loft.bottom, ZONES.loft.bottom + 400],
  tall: [ZONES.tall.bottom, ZONES.tall.top],
};

function anchorBox(room: Room, a: Anchor): Box | null {
  const f = wallFrames(room).find((x) => x.wallId === a.wallId);
  return f ? wallBoxToWorld(f, { along: [a.offsetMm, a.offsetMm + a.widthMm], depth: [0, LAYER_DEPTH_MM[a.layer]], z: BAND[a.layer] }) : null;
}

/** The 8 corners of a world-mm box, grown by `pad`, in three metres. */
function corners(b: Box, pad: number): THREE.Vector3[] {
  return [b.minX - pad, b.maxX + pad].flatMap((x) =>
    [b.minY - pad, b.maxY + pad].flatMap((y) => [Math.max(0, b.minZ - pad), b.maxZ + pad].map((z) => new THREE.Vector3(x * M, z * M, y * M))),
  );
}

interface Tween {
  start: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromZoom: number;
  toZoom: number;
}
const FRAME_MS = 480;

const MIN_ZOOM = 20;
const MAX_ZOOM = 800;
const TURN_MS = 380;
/** Isometric-ish direction for the "3D" view: from the front-left, above. */
const ISO = new THREE.Vector3(-0.55, 0.62, 0.82).normalize();
const FAR = 30;

interface Framing {
  centre: THREE.Vector3;
  /** Room corners, floor and ceiling, for fitting. */
  corners: THREE.Vector3[];
}

function framing(room: Room): Framing {
  const { inner } = roomOutline(room, 0);
  const pts = inner.length ? inner : [{ x: 0, y: 0 }, { x: 3000, y: 2400 }];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const top = room.ceilingHeightMm * M;
  const corners = [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [0, top].map((h) => new THREE.Vector3(x * M, h, y * M))));
  return { centre: new THREE.Vector3(((x0 + x1) / 2) * M, 1.0, ((y0 + y1) / 2) * M), corners };
}

/** Zoom (pixels per metre) at which `corners` fill the view from the camera's current pose. */
function fitZoom(camera: THREE.OrthographicCamera, corners: THREE.Vector3[], size: { width: number; height: number }, margin = 0.86) {
  camera.updateMatrixWorld();
  const inv = camera.matrixWorldInverse;
  let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const c of corners) {
    const v = c.clone().applyMatrix4(inv);
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  const zoom = Math.min(size.width / (maxX - minX), size.height / (maxY - minY)) * margin;
  return { zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)), centreOffset: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0) };
}

interface Turn {
  start: number;
  pivot: THREE.Vector3;
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  angle: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const UP = new THREE.Vector3(0, 1, 0);

export const CameraRig = forwardRef<SceneApi, { room: Room; boxes: Map<string, Box>; activeWallId?: string | null }>(function CameraRig({ room, boxes, activeWallId }, ref) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const frame = useMemo(() => framing(room), [room]);
  /** The user has moved the view since the last fit. */
  const touched = useRef(false);
  const turn = useRef<Turn | null>(null);
  const tween = useRef<Tween | null>(null);
  const boxesRef = useRef(boxes);
  useEffect(() => {
    boxesRef.current = boxes;
  }, [boxes]);
  const dragging = useRef(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const frameRef = useRef(frame);
  frameRef.current = frame;

  /** Puts the camera on a pose and fits the room in view. */
  const place = useCallback(
    (position: THREE.Vector3, target: THREE.Vector3, corners = frameRef.current.corners) => {
      const c = controls.current;
      turn.current = null;
      tween.current = null;
      camera.position.copy(position);
      camera.lookAt(target);
      const { zoom, centreOffset } = fitZoom(camera, corners, sizeRef.current);
      // Re-centre on the fitted content rather than the target point.
      const shift = centreOffset.applyQuaternion(camera.quaternion);
      camera.position.add(shift);
      const t = target.clone().add(shift);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      if (c) {
        c.target.copy(t);
        c.update();
      } else {
        camera.lookAt(t);
      }
      invalidate();
    },
    [camera, invalidate],
  );

  const home = useCallback(() => {
    const { centre } = frameRef.current;
    place(centre.clone().addScaledVector(ISO, FAR / 2), centre);
  }, [place]);

  // Fit on first layout, and on resizes until the user moves the view.
  useEffect(() => {
    if (size.width === 0 || size.height === 0 || touched.current) return;
    home();
  }, [size, home]);

  const presets = useMemo(
    () => ({
      "3d": home,
      top: () => {
        const { centre } = frameRef.current;
        const target = new THREE.Vector3(centre.x, 0, centre.z);
        place(target.clone().add(new THREE.Vector3(0, FAR / 2, 0.0001)), target);
      },
      wall: () => {
        const frames = wallFrames(room);
        const f = frames.find((x) => x.wallId === activeWallId) ?? frames[0];
        if (!f) return;
        const mid = wallToWorld(f, f.lengthMm / 2, 0);
        // Stand inside the room, clear of the units on the opposite wall.
        const { inner } = roomOutline(room, 0);
        const depth = Math.max(...inner.map((p) => (p.x - mid.x) * f.n.x + (p.y - mid.y) * f.n.y));
        const stand = Math.max(900, depth - 750);
        const eye = wallToWorld(f, f.lengthMm / 2, stand);
        const h = (room.ceilingHeightMm / 2) * M;
        const a = wallToWorld(f, 0, 0);
        const b = wallToWorld(f, f.lengthMm, 0);
        const corners = [a, b].flatMap((p) => [0, room.ceilingHeightMm * M].map((y) => new THREE.Vector3(p.x * M, y, p.y * M)));
        place(new THREE.Vector3(eye.x * M, h, eye.y * M), new THREE.Vector3(mid.x * M, h, mid.y * M), corners);
      },
    }),
    [home, place, room, activeWallId],
  );

  useImperativeHandle(
    ref,
    () => ({
      rotate: (direction) => {
        const c = controls.current;
        if (!c) return;
        touched.current = true;
        // Chain quick clicks: start from where a running turn would end.
        const running = turn.current;
        const pivot = new THREE.Vector3(frameRef.current.centre.x, c.target.y, frameRef.current.centre.z);
        const fromPos = camera.position.clone();
        const fromTarget = c.target.clone();
        let angle = (-direction * Math.PI) / 2;
        if (running) {
          const left = running.angle * (1 - ease(Math.min(1, (performance.now() - running.start) / TURN_MS)));
          angle += left;
        }
        turn.current = { start: performance.now(), pivot, fromPos, fromTarget, angle };
        invalidate();
      },
      zoom: (factor) => {
        touched.current = true;
        camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
        camera.updateProjectionMatrix();
        controls.current?.update();
        invalidate();
      },
      reset: () => {
        touched.current = false;
        home();
      },
      preset: (p) => {
        touched.current = p !== "3d";
        presets[p]();
      },
      snapshot: () => {
        const c = controls.current;
        const saved = { pos: camera.position.clone(), target: c?.target.clone(), zoom: camera.zoom, touched: touched.current };
        home();
        gl.render(scene, camera);
        const url = gl.domElement.toDataURL("image/png");
        camera.position.copy(saved.pos);
        camera.zoom = saved.zoom;
        camera.updateProjectionMatrix();
        if (c && saved.target) {
          c.target.copy(saved.target);
          c.update();
        }
        touched.current = saved.touched;
        invalidate();
        return url;
      },
      frame: ({ placementIds, anchor }) => {
        const c = controls.current;
        if (!c) return;
        const list = placementIds.map((id) => boxesRef.current.get(id)).filter((b): b is Box => !!b);
        const fromAnchor = !list.length && anchor ? anchorBox(room, anchor) : null;
        if (fromAnchor) list.push(fromAnchor);
        if (!list.length) return;
        const b = list.reduce((u, x) => ({
          minX: Math.min(u.minX, x.minX),
          maxX: Math.max(u.maxX, x.maxX),
          minY: Math.min(u.minY, x.minY),
          maxY: Math.max(u.maxY, x.maxY),
          minZ: Math.min(u.minZ, x.minZ),
          maxZ: Math.max(u.maxZ, x.maxZ),
        }));
        touched.current = true;
        turn.current = null;
        const toTarget = new THREE.Vector3(((b.minX + b.maxX) / 2) * M, ((b.minZ + b.maxZ) / 2) * M, ((b.minY + b.maxY) / 2) * M);
        const toPos = toTarget.clone().add(camera.position.clone().sub(c.target));
        // Fit the target with plenty of room around it, seen from the new pose.
        const probe = camera.clone();
        probe.position.copy(toPos);
        probe.lookAt(toTarget);
        const { zoom } = fitZoom(probe, corners(b, 1100), sizeRef.current, 0.9);
        tween.current = { start: performance.now(), fromPos: camera.position.clone(), toPos, fromTarget: c.target.clone(), toTarget, fromZoom: camera.zoom, toZoom: zoom };
        invalidate();
      },
    }),
    [camera, gl, home, invalidate, presets, room, scene],
  );

  // Framing animation: move camera, target and zoom together.
  useFrame(() => {
    const t = tween.current;
    const c = controls.current;
    if (!t || !c) return;
    const k = ease(Math.min(1, (performance.now() - t.start) / FRAME_MS));
    camera.position.lerpVectors(t.fromPos, t.toPos, k);
    c.target.lerpVectors(t.fromTarget, t.toTarget, k);
    camera.zoom = t.fromZoom + (t.toZoom - t.fromZoom) * k;
    camera.updateProjectionMatrix();
    c.update();
    if (k < 1) invalidate();
    else tween.current = null;
  });

  // Quarter-turn animation: rotate camera and target about the room centre.
  useFrame(() => {
    const t = turn.current;
    const c = controls.current;
    if (!t || !c) return;
    const k = Math.min(1, (performance.now() - t.start) / TURN_MS);
    const a = t.angle * ease(k);
    camera.position.copy(t.fromPos).sub(t.pivot).applyAxisAngle(UP, a).add(t.pivot);
    c.target.copy(t.fromTarget).sub(t.pivot).applyAxisAngle(UP, a).add(t.pivot);
    c.update();
    if (k < 1) invalidate();
    else turn.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      maxPolarAngle={Math.PI / 2.02}
      enableDamping={false}
      // Only a real drag or wheel counts as moving the view; a click to select doesn't.
      onStart={() => {
        dragging.current = true;
        turn.current = null;
        tween.current = null;
      }}
      onChange={() => {
        if (dragging.current) touched.current = true;
      }}
      onEnd={() => {
        dragging.current = false;
      }}
    />
  );
});
