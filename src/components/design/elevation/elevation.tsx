"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { catalogue, getAppliance, getFinish } from "@/domain/catalogue";
import { inheritedFinish } from "@/domain/finish-defaults";
import { isModulePlacement } from "@/domain/geometry";
import type { Placement } from "@/domain/types";
import { ZONES } from "@/domain/zones";
import { mm } from "@/lib/room-format";
import { projectStore, useBlockedIds, useProjectStore } from "@/store/project-store";
import { RotateCw } from "lucide-react";
import { turnSubject } from "@/domain/turn";
import { commitGhost, turnSelected } from "../commit";
import { dragPlacement, ghostAt, snappedGhost, validHosts, widthOf, type WallPlaced } from "../ghost";
import { useInteraction, type ClientPoint, type DragItem, type ElevationApi, type Ghost } from "../interaction";
import { elevationModel, layerBand, type ElevUnit } from "./elevation-model";

const C = {
  ink: "var(--mk-ink)",
  ink2: "var(--mk-ink-2)",
  faint: "#b3ada3",
  line: "#d9d4cc",
  hatch: "#bdb7ad",
  accent: "var(--mk-accent)",
  accentInk: "var(--mk-accent-ink)",
  ok: "var(--mk-ok)",
  okSoft: "var(--mk-ok-soft)",
  bad: "var(--mk-bad)",
  badSoft: "var(--mk-bad-soft)",
  warn: "var(--mk-warn)",
  plinth: "#ebe8e2",
  counter: "#2b2a27",
};

// Margins around the wall in mm, for dimension chains and labels.
const M = { left: 300, right: 560, top: 420, bottom: 640 };
const SNAP_PX = 8;

type Gesture =
  | { kind: "pan"; x: number; y: number; cx: number; cy: number; moved: boolean }
  | { kind: "unit"; id: string; grabMm: number; x: number; moved: boolean; last?: { x: number; y: number } };

/** Fronts: drawer splits, shutter dividers and handle marks, in wall-local mm. */
function Fronts({ u, Y, handleless }: { u: ElevUnit; Y: (z: number) => number; handleless: boolean }) {
  const mod = u.mod;
  if (!mod) return null;
  const { shutters, drawers } = mod.fronts;
  const z0 = u.layer === "base" ? ZONES.baseCarcass.bottom : u.z0;
  const z1 = u.z1;
  const w = u.x1 - u.x0;
  const lines: React.ReactNode[] = [];
  const line = (key: string, x1: number, za: number, x2: number, zb: number, width = 0.9) =>
    lines.push(<line key={key} x1={x1} y1={Y(za)} x2={x2} y2={Y(zb)} stroke={C.ink2} strokeWidth={width} vectorEffect="non-scaling-stroke" />);
  const handleH = (key: string, z: number) => !handleless && line(key, u.x0 + w * 0.38, z, u.x1 - w * 0.38, z, 1.6);
  const handleV = (key: string, x: number, z: number) => !handleless && line(key, x, z - 50, x, z + 50, 1.6);

  if (drawers > 0) {
    // A shallow top drawer and equal ones below, as on hob units.
    const h = z1 - z0;
    const splits = drawers === 3 ? [z1 - h * 0.25, z1 - h * 0.62] : Array.from({ length: drawers - 1 }, (_, i) => z1 - (h * (i + 1)) / drawers);
    splits.forEach((z, i) => line(`d${i}`, u.x0, z, u.x1, z));
    [z1, ...splits].forEach((top, i) => handleH(`h${i}`, top - 45));
    return <g pointerEvents="none">{lines}</g>;
  }
  if (u.layer === "tall") {
    // Tall housing: lower and upper shutters around the appliance zone; pantry: two stacked shutters.
    const cuts = mod.hosts ? [700, 1800] : [1380];
    cuts.forEach((z, i) => line(`t${i}`, u.x0, z, u.x1, z));
    handleV("th0", u.x1 - 45, mod.hosts ? 1900 : 1450);
    handleV("th1", u.x1 - 45, mod.hosts ? 600 : 1300);
    return <g pointerEvents="none">{lines}</g>;
  }
  const handleZ = u.layer === "base" ? z1 - 90 : z0 + 90;
  if (shutters === 2) {
    const mid = (u.x0 + u.x1) / 2;
    line("mid", mid, z0, mid, z1);
    handleV("hl", mid - 40, handleZ);
    handleV("hr", mid + 40, handleZ);
  } else if (shutters === 1) {
    // Blind corner units: the shutter is the open part, handle next to the blind section.
    if (u.blind) {
      const blindRight = u.blind[1] === u.x1;
      line("blind", blindRight ? u.blind[0] : u.blind[1], z0, blindRight ? u.blind[0] : u.blind[1], z1);
      handleV("h", blindRight ? u.blind[0] - 40 : u.blind[1] + 40, handleZ);
    } else {
      handleV("h", u.x1 - 40, handleZ);
    }
  }
  return <g pointerEvents="none">{lines}</g>;
}

/** Width a print-mode elevation is laid out for, in CSS px (it scales to its container). */
const PRINT_WIDTH_PX = 720;

/**
 * One wall's elevation. `print` draws it read-only at a fixed scale for the quote PDF: no
 * selection, drags, ghosts or highlights, and nothing registered with the Design screen.
 */
export function Elevation({ wallId, print = false }: { wallId: string; print?: boolean }) {
  const project = useProjectStore((s) => s.project);
  const liveSelected = useProjectStore((s) => s.ui.selectedPlacementId);
  const liveZoom = useProjectStore((s) => s.ui.elevationZoom);
  const setZoom = useProjectStore((s) => s.setElevationZoom);
  const liveBlocked = useBlockedIds();
  const liveGhost = useInteraction((s) => s.ghost);
  const liveItem = useInteraction((s) => s.item);
  const liveHighlight = useInteraction((s) => s.highlight);
  const selectedId = print ? null : liveSelected;
  const zoom = print ? 1 : liveZoom;
  const blocked = print ? new Set<string>() : liveBlocked;
  const ghost = print ? null : liveGhost;
  const dragItem = print ? null : liveItem;
  const highlight = print ? null : liveHighlight;
  const model = useMemo(() => elevationModel(project, wallId), [project, wallId]);

  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [measured, setSize] = useState({ w: 600, h: 600 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || print) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [print]);

  const length = model?.length ?? 1000;
  const ceiling = model?.ceiling ?? 2700;
  const Y = (z: number) => ceiling - z;
  const fit = { x: -M.left, y: -M.top, w: length + M.left + M.right, h: ceiling + M.top + M.bottom };
  const size = print ? { w: PRINT_WIDTH_PX, h: (PRINT_WIDTH_PX * fit.h) / fit.w } : measured;
  // Panning belongs to a wall: switching walls (a tab, or R while dragging) starts fitted.
  const [panState, setPanState] = useState<{ cx: number; cy: number; wallId: string } | null>(null);
  const pan = panState?.wallId === wallId ? panState : null;
  const setPan = (p: { cx: number; cy: number }) => setPanState({ ...p, wallId });
  const cx = pan?.cx ?? fit.x + fit.w / 2;
  const cy = pan?.cy ?? fit.y + fit.h / 2;
  const aspect = size.w / Math.max(1, size.h);
  let vw = fit.w / zoom;
  let vh = fit.h / zoom;
  if (vw / vh < aspect) vw = vh * aspect;
  else vh = vw / aspect;
  const vb = { x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh };
  const px = vw / Math.max(1, size.w);
  const k = (n: number) => n * px; // screen px → mm

  // Latest values for callbacks that outlive a render (rAF, the registered API).
  const latest = useRef({ project, px, wallId, Y });
  latest.current = { project, px, wallId, Y };

  const toLocal = (p: ClientPoint) => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    const q = new DOMPoint(p.x, p.y).matrixTransform(m);
    return { x: q.x, y: q.y };
  };

  // ----- ghosts, throttled to one fast check per animation frame -----
  const resolve = (pointer: ClientPoint, item: DragItem, magnets: boolean, grabMm?: number): Ghost | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (pointer.x < r.left || pointer.x > r.right || pointer.y < r.top || pointer.y > r.bottom) return null;
    const { project: p, px: scale, wallId: wall } = latest.current;
    const base = dragPlacement(p, item, wall);
    if (!base) return null;
    base.wallId = wall;
    const at = toLocal(pointer);
    const raw = at.x - (grabMm ?? (item.kind === "move" ? item.grabMm : widthOf(base) / 2));
    return snappedGhost(p, item, base, raw, SNAP_PX * scale, magnets);
  };

  const frame = useRef(0);
  const pending = useRef<() => Ghost | null>(() => null);
  const schedule = (compute: () => Ghost | null) => {
    pending.current = compute;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      useInteraction.getState().set({ ghost: pending.current() });
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const gesture = useRef<Gesture | null>(null);

  // Drags from the catalogue arrive as pointer updates in the interaction store.
  const alt = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (alt.current = e.altKey);
    if (print) return;
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    const unsub = useInteraction.subscribe((s, prev) => {
      if ((s.item?.kind !== "new" && s.item?.kind !== "newAppliance") || !s.pointer || s.pointer === prev.pointer) return;
      const item = s.item;
      const pointer = s.pointer;
      schedule(() => resolve(pointer, item, !alt.current));
    });
    return () => {
      unsub();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register so the screen can resolve drops and anchor cards here.
  useEffect(() => {
    if (print) return;
    const api: ElevationApi = {
      wallId,
      resolve: (pointer, item, magnets) => resolve(pointer, item, magnets),
      resolveAt: (placement: Placement, offsetMm: number) =>
        ghostAt(latest.current.project, { kind: "nudge", placementId: placement.id }, placement as WallPlaced, offsetMm),
      locate: (offsetMm, zMm) => {
        const ctm = svgRef.current?.getScreenCTM();
        if (!ctm) return { x: 0, y: 0 };
        const q = new DOMPoint(offsetMm, latest.current.Y(zMm)).matrixTransform(ctm);
        return { x: q.x, y: q.y };
      },
    };
    useInteraction.getState().set({ elevation: api });
    return () => {
      if (useInteraction.getState().elevation === api) useInteraction.getState().set({ elevation: null });
    };
  }, [wallId]); // eslint-disable-line react-hooks/exhaustive-deps

  // R while dragging switches the wall shown here (this component stays mounted, so a unit drag
  // carries on): show the dragged unit at the pointer on the new wall straight away.
  const shownWall = useRef(wallId);
  useEffect(() => {
    if (print || shownWall.current === wallId) return;
    shownWall.current = wallId;
    const { item, pointer } = useInteraction.getState();
    const g = gesture.current;
    if ((item?.kind === "new" || item?.kind === "newAppliance") && pointer) {
      schedule(() => resolve(pointer, item, !alt.current));
    } else if (g?.kind === "unit" && g.moved && g.last) {
      const move: DragItem = { kind: "move", placementId: g.id, grabMm: g.grabMm };
      const last = g.last;
      schedule(() => {
        const r = svgRef.current!.getBoundingClientRect();
        return resolve({ x: Math.min(r.right - 1, Math.max(r.left + 1, last.x)), y: (r.top + r.bottom) / 2 }, move, !alt.current);
      });
    }
  }, [wallId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- pointer gestures: pan the view, or drag a unit along its wall -----
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    svgRef.current!.setPointerCapture(e.pointerId);
    gesture.current = { kind: "pan", x: e.clientX, y: e.clientY, cx, cy, moved: false };
  };
  const onUnitPointerDown = (u: ElevUnit, e: React.PointerEvent) => {
    if (e.button !== 0 || print) return;
    e.stopPropagation();
    projectStore.getState().select(u.id);
    useInteraction.getState().set({ outcome: null, highlight: null });
    // Units and free appliances drag along their wall.
    svgRef.current!.setPointerCapture(e.pointerId);
    gesture.current = { kind: "unit", id: u.id, grabMm: toLocal({ x: e.clientX, y: e.clientY }).x - u.x0, x: e.clientX, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 4) return;
      g.moved = true;
      setPan({ cx: g.cx - dx * px, cy: g.cy - dy * px });
      return;
    }
    if (!g.moved && Math.abs(e.clientX - g.x) < 4) return;
    g.moved = true;
    g.last = { x: e.clientX, y: e.clientY };
    const item: DragItem = { kind: "move", placementId: g.id, grabMm: g.grabMm };
    const pointer = { x: e.clientX, y: e.clientY };
    const magnets = !e.altKey;
    useInteraction.getState().set({ item });
    // Vertical position doesn't matter while moving along the wall: clamp into the svg.
    schedule(() => {
      const r = svgRef.current!.getBoundingClientRect();
      return resolve({ x: Math.min(r.right - 1, Math.max(r.left + 1, pointer.x)), y: (r.top + r.bottom) / 2 }, item, magnets);
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === "pan" && !g.moved) {
      projectStore.getState().select(null);
      useInteraction.getState().set({ outcome: null, highlight: null });
    }
    if (g?.kind === "unit" && g.moved) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      const item: DragItem = { kind: "move", placementId: g.id, grabMm: g.grabMm };
      const r = svgRef.current!.getBoundingClientRect();
      const final = resolve({ x: Math.min(r.right - 1, Math.max(r.left + 1, e.clientX)), y: (r.top + r.bottom) / 2 }, item, !e.altKey);
      useInteraction.getState().set({ item: null, ghost: null });
      if (final) commitGhost(final, { x: e.clientX, y: e.clientY });
    }
  };

  if (!model) return null;

  const font = (n: number) => k(n);
  const text = (x: number, y: number, s: string, size = 10, { key, ...opts }: React.SVGProps<SVGTextElement> & { key?: string } = {}) => (
    <text
      key={key}
      x={x}
      y={y}
      fontSize={font(size)}
      textAnchor="middle"
      className="num"
      fill={C.ink2}
      stroke="white"
      strokeWidth={font(3)}
      paintOrder="stroke"
      pointerEvents="none"
      {...opts}
    >
      {s}
    </text>
  );

  const hostedOn = (id: string) =>
    project.appliances
      .filter((a) => a.kind === "hosted" && a.hostPlacementId === id)
      .map((a) => getAppliance(catalogue, a.applianceId).id.toUpperCase());

  const hostLabel = (c: Placement) => ("kind" in c && c.kind === "hosted" ? (project.modules.find((m) => m.id === c.hostPlacementId)?.moduleCode ?? "") : "");
  const baseHex = getFinish(catalogue, inheritedFinish(project, catalogue, "B600").finishId).hex;
  const selectAppliance = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0 || print) return;
    e.stopPropagation();
    projectStore.getState().select(id);
    useInteraction.getState().set({ outcome: null, highlight: null });
  };

  const ghostFor = (id: string) => (ghost && ghost.item.kind !== "new" && ghost.candidate.id === id ? ghost : null);

  const renderUnit = (u: ElevUnit) => {
    const isSel = selectedId === u.id;
    const isBlocked = blocked.has(u.id);
    const moving = !!ghostFor(u.id);
    const w = u.x1 - u.x0;
    const p = u.placement;
    const isFiller = u.mod?.family === "FIL";
    // Selected: an outline only, so the unit keeps its finish tint (M2). Blocked: filled red.
    const fill = isBlocked ? C.badSoft : "white";
    const stroke = isBlocked ? C.bad : isSel ? C.accent : C.ink;
    const tint = isModulePlacement(p) ? getFinish(catalogue, p.finishId).hex : "#9aa3ad";
    const bodyZ0 = u.layer === "base" && u.mod ? ZONES.baseCarcass.bottom : u.z0;
    const isChimney = !isModulePlacement(p) && p.applianceId === "chimney";
    const isFridge = !isModulePlacement(p) && p.applianceId === "fridge";
    const isDishwasher = !isModulePlacement(p) && p.applianceId === "dishwasher";
    const labelZ = u.layer === "base" ? bodyZ0 + (u.z1 - bodyZ0) * 0.7 : u.layer === "tall" ? 1950 : (bodyZ0 + u.z1) / 2;
    const sub = hostedOn(u.id).join(" + ") || (isFiller ? "" : mm(w));
    return (
      <g
        key={u.id}
        opacity={moving ? 0.35 : 1}
        className={isModulePlacement(p) ? "cursor-grab" : "cursor-pointer"}
        onPointerDown={(e) => onUnitPointerDown(u, e)}
        data-unit={u.id}
      >
        {u.layer === "base" && (u.mod || isDishwasher) && (
          <rect x={u.x0 + 20} y={Y(ZONES.plinth.top)} width={w - 40} height={ZONES.plinth.top} fill={C.plinth} stroke={C.line} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        )}
        {isChimney ? (
          <polygon
            points={`${u.x0},${Y(u.z0)} ${u.x1},${Y(u.z0)} ${u.x1 - w * 0.12},${Y(u.z0 + 160)} ${u.x0 + w * 0.36},${Y(u.z0 + 160)} ${u.x0 + w * 0.36},${Y(u.z1)} ${u.x1 - w * 0.36},${Y(u.z1)} ${u.x1 - w * 0.36},${Y(u.z0 + 160)} ${u.x0 + w * 0.12},${Y(u.z0 + 160)}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={isSel || isBlocked ? 2 : 1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : isFridge ? (
          // Space reserved for the customer's refrigerator: an outline only.
          <rect x={u.x0} y={Y(u.z1)} width={w} height={u.z1 - u.z0} fill={fill} fillOpacity={isBlocked ? 1 : 0.01} stroke={stroke} strokeWidth={isSel || isBlocked ? 2 : 1.2} strokeDasharray="10 6" vectorEffect="non-scaling-stroke" />
        ) : (
          <>
            <rect x={u.x0} y={Y(u.z1)} width={w} height={u.z1 - (isDishwasher ? ZONES.plinth.top : bodyZ0)} fill={fill} stroke={stroke} strokeWidth={isSel || isBlocked ? 2 : 1} vectorEffect="non-scaling-stroke" />
            {!isBlocked && (
              <rect
                x={u.x0}
                y={Y(u.z1)}
                width={w}
                height={u.z1 - (isDishwasher ? ZONES.plinth.top : bodyZ0)}
                fill={isDishwasher ? baseHex : tint}
                opacity={isDishwasher ? 0.3 : 0.14}
                pointerEvents="none"
                data-finish-tint={isModulePlacement(p) ? p.finishId : undefined}
              />
            )}
            {isDishwasher && <line x1={u.x0 + w * 0.3} y1={Y(u.z1 - 50)} x2={u.x1 - w * 0.3} y2={Y(u.z1 - 50)} stroke={C.ink2} strokeWidth={1.6} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
          </>
        )}
        {isFiller && <rect x={u.x0} y={Y(u.z1)} width={w} height={u.z1 - bodyZ0} fill="url(#elev-hatch)" pointerEvents="none" />}
        {u.blind && (
          <rect x={u.blind[0]} y={Y(u.z1)} width={u.blind[1] - u.blind[0]} height={u.z1 - bodyZ0} fill="url(#elev-hatch)" pointerEvents="none" />
        )}
        {!isChimney && <Fronts u={u} Y={Y} handleless={isModulePlacement(p) && p.shutterTypeId === "handleless"} />}
        {!isFiller &&
          text((u.x0 + u.x1) / 2, Y(isFridge ? 1200 : isDishwasher ? 500 : labelZ), isChimney ? "90 CM CHIMNEY" : isModulePlacement(p) ? u.label : u.label.toUpperCase(), w < 400 ? 8.5 : isModulePlacement(p) ? 10 : 8.5, {
            fontWeight: 600,
            fill: isBlocked ? C.bad : isSel ? C.accentInk : C.ink,
          })}
        {!isFiller && isModulePlacement(p) && text((u.x0 + u.x1) / 2, Y(labelZ) + font(12), sub, 8.5, { fill: isSel ? C.accentInk : C.faint })}
      </g>
    );
  };

  const renderGhost = (g: Ghost) => {
    if (g.slot.wallId !== wallId) return null;
    const c = g.slot;
    const [z0, z1] = g.z;
    const ok = g.status === "pass";
    const col = ok ? C.ok : C.bad;
    const x0 = c.offsetMm;
    const x1 = c.offsetMm + c.widthMm;
    const midZ = (z0 + z1) / 2;
    const arrow = (from: number, to: number, value: number | null, key: string) =>
      value !== null && value > 0 ? (
        <g key={key}>
          <line x1={from} y1={Y(midZ)} x2={to} y2={Y(midZ)} stroke={col} strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
          {text((from + to) / 2, Y(midZ) - font(5), mm(value), 9.5, { fill: col, fontWeight: 600 })}
        </g>
      ) : null;
    return (
      <g pointerEvents="none" data-ghost={g.status}>
        <rect x={x0} y={Y(z1)} width={c.widthMm} height={z1 - z0} fill={ok ? C.okSoft : C.badSoft} fillOpacity={0.85} stroke={col} strokeWidth={1.6} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        {text((x0 + x1) / 2, Y(midZ) + font(4), g.snap === "host" ? `${g.label} → ${hostLabel(g.candidate)}` : g.label, 10, { fill: col, fontWeight: 700 })}
        {arrow(x0 - (g.gaps.left ?? 0), x0, g.gaps.left, "gl")}
        {arrow(x1, x1 + (g.gaps.right ?? 0), g.gaps.right, "gr")}
        {!ok && g.reason && (() => {
          const label = g.reason.length > 58 ? `${g.reason.slice(0, 57)}…` : g.reason;
          const w = font(label.length * 6.1 + 20);
          const x = Math.min(Math.max(vb.x + font(6), (x0 + x1) / 2 - w / 2), vb.x + vb.w - w - font(6));
          return (
            <g>
              <rect x={x} y={Y(z1) - font(30)} width={w} height={font(22)} rx={font(5)} fill={C.bad} />
              <text x={x + font(10)} y={Y(z1) - font(15)} fontSize={font(11)} fill="white">
                {label}
              </text>
            </g>
          );
        })()}
      </g>
    );
  };

  // Dimension chain along y, with ticks and centred values.
  const dimChain = (cuts: number[], y: number, key: string, emphasis?: (a: number, b: number) => boolean) =>
    cuts.length > 2 ? (
      <g key={key} pointerEvents="none">
        <line x1={cuts[0]} y1={y} x2={cuts[cuts.length - 1]} y2={y} stroke={C.ink2} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        {cuts.map((c) => (
          <g key={c}>
            <line x1={c} y1={y - font(6)} x2={c} y2={y + font(6)} stroke={C.ink2} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
            <line x1={c - font(4)} y1={y + font(4)} x2={c + font(4)} y2={y - font(4)} stroke={C.ink2} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {cuts.slice(1).map((c, i) => {
          const a = cuts[i];
          const narrow = (c - a) / px < 26;
          return text((a + c) / 2, y + font(narrow ? 22 : 15), mm(c - a), narrow ? 7.5 : 9, {
            key: `${a}-${c}`,
            fill: emphasis?.(a, c) ? C.accentInk : C.ink2,
            fontWeight: emphasis?.(a, c) ? 600 : 400,
          });
        })}
      </g>
    ) : null;

  const sel = model.units.find((u) => u.id === selectedId);
  const turnId = selectedId ? turnSubject(project, selectedId)?.id : undefined;
  const turning = turnId ? model.units.find((u) => u.id === turnId) : undefined;
  const vDim = (x: number, z0: number, z1: number, label: string, key: string) => (
    <g key={key} pointerEvents="none">
      <line x1={x} y1={Y(z0)} x2={x} y2={Y(z1)} stroke={C.ink2} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      {[z0, z1].map((z) => (
        <line key={z} x1={x - font(4)} y1={Y(z) + font(4)} x2={x + font(4)} y2={Y(z) - font(4)} stroke={C.ink2} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {text(x + font(12), Y((z0 + z1) / 2), label, 8.5, { transform: `rotate(90 ${x + font(12)} ${Y((z0 + z1) / 2)})`, letterSpacing: font(0.8) })}
    </g>
  );

  const cursor = gesture.current?.kind === "unit" ? "grabbing" : dragItem?.kind === "new" || dragItem?.kind === "newAppliance" ? "copy" : "default";

  const handlers = print
    ? {}
    : {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onWheel: (e: React.WheelEvent) => setZoom(zoom * Math.exp(-e.deltaY * 0.0015)),
      };
  return (
    <div ref={boxRef} className={print ? "w-full" : "relative min-h-0 flex-1"}>
      <svg
        ref={svgRef}
        className={print ? "block h-auto w-full" : "absolute inset-0 size-full touch-none select-none"}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        style={print ? undefined : { cursor }}
        {...handlers}
        role="img"
        aria-label={`Elevation of Wall ${wallId}`}
        {...(print ? { "data-print-elevation": wallId } : { "data-elevation": wallId })}
      >
        <defs>
          <pattern id="elev-hatch" patternUnits="userSpaceOnUse" width={font(7)} height={font(7)} patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={font(7)} stroke={C.hatch} strokeWidth={font(0.9)} />
          </pattern>
          <pattern id="elev-warn-hatch" patternUnits="userSpaceOnUse" width={font(6)} height={font(6)} patternTransform="rotate(45)">
            <rect width={font(6)} height={font(6)} fill="var(--mk-warn-soft)" />
            <line x1="0" y1="0" x2="0" y2={font(6)} stroke={C.warn} strokeWidth={font(1.4)} />
          </pattern>
        </defs>

        {/* Wall, ceiling and floor */}
        <rect x={0} y={0} width={length} height={ceiling} fill="#fcfbf9" stroke={C.ink2} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        <line x1={-font(18)} y1={Y(0)} x2={length + font(18)} y2={Y(0)} stroke={C.ink} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <line x1={-font(18)} y1={Y(ceiling)} x2={length + font(18)} y2={Y(ceiling)} stroke={C.ink} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />

        {/* Unusable: columns, the adjacent wall's units, beams from other walls */}
        {model.zones.map((z) => (
          <g key={z.key} pointerEvents="none">
            <rect x={z.x0} y={Y(z.z1)} width={z.x1 - z.x0} height={z.z1 - z.z0} fill="#efede9" />
            <rect x={z.x0} y={Y(z.z1)} width={z.x1 - z.x0} height={z.z1 - z.z0} fill="url(#elev-hatch)" stroke={C.faint} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
            {z.kind === "column" &&
              text((z.x0 + z.x1) / 2, Y(z.z1 / 2), z.label.toUpperCase(), 7.5, {
                transform: `rotate(-90 ${(z.x0 + z.x1) / 2} ${Y(z.z1 / 2)})`,
                fill: C.faint,
                letterSpacing: font(0.8),
              })}
          </g>
        ))}

        {/* Beam on this wall, shaded by depth */}
        {model.beams.map((b) => (
          <g key={b.id} pointerEvents="none">
            <rect x={0} y={Y(ceiling)} width={length} height={ceiling - b.bottom} fill="#e4e0d8" opacity={Math.min(0.9, 0.35 + b.depth / 600)} />
            <rect x={0} y={Y(ceiling)} width={length} height={ceiling - b.bottom} fill="url(#elev-hatch)" />
            <line x1={0} y1={Y(b.bottom)} x2={length} y2={Y(b.bottom)} stroke={C.ink2} strokeWidth={1.2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" />
            {text(length / 2, Y((ceiling + b.bottom) / 2) + font(3), `BEAM · ${b.depth} DEEP · BOTTOM ${b.bottom}`, 8, { fill: C.ink2, letterSpacing: font(0.6) })}
          </g>
        ))}

        {/* Openings and services */}
        {model.windows.map((w) => (
          <g key={w.id} pointerEvents="none">
            <rect x={w.x0} y={Y(w.z1)} width={w.x1 - w.x0} height={w.z1 - w.z0} fill="white" stroke={C.ink2} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <rect x={w.x0 + 40} y={Y(w.z1) + 40} width={w.x1 - w.x0 - 80} height={w.z1 - w.z0 - 80} fill="none" stroke={C.faint} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
            <line x1={(w.x0 + w.x1) / 2} y1={Y(w.z1) + 40} x2={(w.x0 + w.x1) / 2} y2={Y(w.z0) - 40} stroke={C.faint} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
            {text((w.x0 + w.x1) / 2, Y((w.z0 + w.z1) / 2), `WINDOW ${w.x1 - w.x0}`, 8, { fill: C.faint, letterSpacing: font(0.6) })}
          </g>
        ))}
        {model.doors.map((d) => (
          <g key={d.id} pointerEvents="none">
            <rect x={d.x0} y={Y(d.z1)} width={d.x1 - d.x0} height={d.z1} fill="#f4f2ee" stroke={C.ink2} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {text((d.x0 + d.x1) / 2, Y(d.z1 / 2), `DOOR ${d.x1 - d.x0}`, 8, { fill: C.faint, letterSpacing: font(0.6) })}
          </g>
        ))}
        {model.plumbing.map((pl) => (
          <g key={pl.id} pointerEvents="none">
            <circle cx={pl.x} cy={Y(520)} r={font(7)} fill="white" stroke={C.ink2} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            <line x1={pl.x - font(4.5)} y1={Y(520) - font(4.5)} x2={pl.x + font(4.5)} y2={Y(520) + font(4.5)} stroke={C.ink2} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            <line x1={pl.x - font(4.5)} y1={Y(520) + font(4.5)} x2={pl.x + font(4.5)} y2={Y(520) - font(4.5)} stroke={C.ink2} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          </g>
        ))}

        {/* Units */}
        {model.units.filter((u) => u.layer !== "base").map(renderUnit)}
        {model.units.filter((u) => u.layer === "base").map(renderUnit)}

        {/* Fitted appliances inside tall housings */}
        {model.fitted.map((f) => {
          const isSel = selectedId === f.id;
          const isBad = blocked.has(f.id);
          return (
            <g key={f.id} className="cursor-pointer" onPointerDown={selectAppliance(f.id)} data-unit={f.id}>
              <rect
                x={f.x0 + 12}
                y={Y(f.z1)}
                width={f.x1 - f.x0 - 24}
                height={f.z1 - f.z0}
                fill="#2b2a27"
                stroke={isBad ? C.bad : isSel ? C.accent : C.ink}
                strokeWidth={isSel || isBad ? 2.4 : 1}
                vectorEffect="non-scaling-stroke"
              />
              <rect x={f.x0 + 60} y={Y(f.z1) + 60} width={f.x1 - f.x0 - 120} height={f.z1 - f.z0 - 150} fill="none" stroke="#6b6863" strokeWidth={0.8} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              {text((f.x0 + f.x1) / 2, Y((f.z0 + f.z1) / 2) + font(3), f.label.toUpperCase(), 7, { fill: "#f4f2ee", stroke: "none" })}
            </g>
          );
        })}

        {/* Countertop and cut-outs */}
        {model.countertop.map(([a, b]) => (
          <rect key={`ct-${a}`} x={a} y={Y(ZONES.countertop.top)} width={b - a} height={ZONES.countertop.top - ZONES.countertop.bottom} fill={C.counter} pointerEvents="none" />
        ))}
        {model.cutOuts.map((c) => {
          const isSel = selectedId === c.id;
          const isBad = blocked.has(c.id);
          const col = isBad ? C.bad : isSel ? C.accent : C.ink;
          const mid = (c.x0 + c.x1) / 2;
          const top = ZONES.countertop.top;
          return c.label.startsWith("Hob") ? (
            // Hob: a black glass slab on the countertop with burner marks.
            <g key={`app-${c.id}`} className="cursor-pointer" onPointerDown={selectAppliance(c.id)} data-unit={c.id}>
              <rect x={c.x0 - 65} y={Y(top + 24)} width={c.x1 - c.x0 + 130} height={24} fill="#1d1c1a" stroke={col} strokeWidth={isSel || isBad ? 2.4 : 0.8} vectorEffect="non-scaling-stroke" />
              {[-210, -70, 70, 210].map((dx) => (
                <rect key={dx} x={mid + dx - 45} y={Y(top + 34)} width={90} height={10} rx={4} fill={isSel ? C.accent : "#55524d"} pointerEvents="none" />
              ))}
            </g>
          ) : (
            // Sink: the bowl under the countertop (dashed) and the tap above it.
            <g key={`app-${c.id}`} className="cursor-pointer" onPointerDown={selectAppliance(c.id)} data-unit={c.id}>
              <rect x={c.x0} y={Y(top)} width={c.x1 - c.x0} height={200} fill="white" fillOpacity={0.01} stroke={col} strokeWidth={isSel || isBad ? 2.2 : 0.9} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <path
                d={`M ${mid} ${Y(top)} L ${mid} ${Y(top + 260)} L ${mid + 170} ${Y(top + 260)} L ${mid + 170} ${Y(top + 215)}`}
                fill="none"
                stroke={col}
                strokeWidth={isSel || isBad ? 3 : 2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <rect x={mid - 40} y={Y(top)} width={80} height={140} fill="white" fillOpacity={0} />
            </g>
          );
        })}
        {model.cutOuts.map((c) => (
          <g key={c.id} pointerEvents="none">
            <rect x={c.x0} y={Y(ZONES.countertop.top) - font(5)} width={c.x1 - c.x0} height={font(5)} fill="none" stroke={C.ink2} strokeWidth={0.8} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
            {text((c.x0 + c.x1) / 2, Y(ZONES.countertop.top) - font(19), c.label.split("|")[0], 7.5, { fill: C.ink2, fontWeight: 600 })}
            {text((c.x0 + c.x1) / 2, Y(ZONES.countertop.top) - font(9), c.label.split("|")[1], 7.5, { fill: C.ink2 })}
          </g>
        ))}

        {/* While dragging a sink, hob, oven or microwave: the units here that can take it. */}
        {dragItem?.kind === "newAppliance" &&
          getAppliance(catalogue, dragItem.applianceId).hosted &&
          validHosts(project, wallId, dragItem.applianceId).map((h) => {
            const [z0, z1] = layerBand(h.layer, 720);
            return (
              <rect
                key={`host-${h.id}`}
                data-host={h.id}
                x={h.offsetMm}
                y={Y(z1)}
                width={h.widthMm}
                height={z1 - z0}
                fill={C.okSoft}
                fillOpacity={0.55}
                stroke={C.ok}
                strokeWidth={1.6}
                strokeDasharray="5 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            );
          })}

        {/* A checks-popover row pointing at a gap or a corner */}
        {highlight && highlight.project === project && highlight.anchor.wallId === wallId && (() => {
          const a = highlight.anchor;
          const [z0, z1] = layerBand(a.layer, 400);
          const x0 = a.offsetMm;
          const w = Math.max(a.widthMm, k(6));
          const xs = a.widthMm < k(6) ? x0 - (w - a.widthMm) / 2 : x0;
          const atStart = a.offsetMm === 0;
          return (
            <g pointerEvents="none" data-highlight={highlight.kind}>
              <rect x={xs} y={Y(z1)} width={w} height={z1 - z0} fill="url(#elev-warn-hatch)" stroke={C.warn} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {highlight.kind === "corner" && (
                <path
                  d={atStart ? `M ${k(4)} ${Y(z1) - k(18)} L ${k(4)} ${Y(z1) - k(4)} L ${k(18)} ${Y(z1) - k(4)}` : `M ${length - k(4)} ${Y(z1) - k(18)} L ${length - k(4)} ${Y(z1) - k(4)} L ${length - k(18)} ${Y(z1) - k(4)}`}
                  fill="none"
                  stroke={C.warn}
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {text(xs + w / 2, Y(z1) - font(highlight.kind === "corner" ? 24 : 8), highlight.kind === "corner" ? "CORNER" : `${mm(a.widthMm)} MM GAP`, 8.5, { fill: C.warn, fontWeight: 700 })}
            </g>
          );
        })()}

        {ghost && renderGhost(ghost)}

        {/* Dimensions: base run below, wall run above, heights on the right */}
        {dimChain(model.baseChain, Y(0) + font(26), "base", (a, b) => !!sel && (sel.layer === "base" || sel.layer === "tall") && sel.x0 === a && sel.x1 === b)}
        {dimChain(model.upperChain, Y(ceiling) - font(22), "upper", (a, b) => !!sel && sel.layer === "wall" && sel.x0 === a && sel.x1 === b)}
        <g pointerEvents="none">
          <line x1={0} y1={Y(0) + font(62)} x2={length} y2={Y(0) + font(62)} stroke={C.ink2} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          {[0, length].map((x) => (
            <line key={x} x1={x} y1={Y(0) + font(56)} x2={x} y2={Y(0) + font(68)} stroke={C.ink2} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          ))}
          {text(length / 2, Y(0) + font(77), `WALL ${wallId}  ${mm(length)}`, 9, { fontWeight: 700, fill: C.ink, letterSpacing: font(0.6) })}
        </g>
        {vDim(length + font(18), 0, ZONES.countertop.top, mm(ZONES.countertop.top), "ctr")}
        {vDim(length + font(46), 0, ceiling, `CEILING ${mm(ceiling)}`, "ceil")}

        {/* The selected unit's turn button: face the next wall (R). A fitted appliance turns its host. */}
        {!print && !dragItem && turning && (() => {
          const r = font(13);
          const cxB = turning.x1 - font(16);
          const cyB = Y(turning.z1) - font(18);
          const go = () => turnSelected(selectedId!, 1);
          return (
            <g
              role="button"
              tabIndex={0}
              aria-label="Turn to the next wall (R)"
              data-turn-button={turning.id}
              className="cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={go}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go()}
            >
              <title>Turn to face the next wall (R) · Shift+R: the previous wall</title>
              <circle cx={cxB} cy={cyB} r={r} fill={C.accent} />
              <RotateCw x={cxB - r * 0.6} y={cyB - r * 0.6} width={r * 1.2} height={r * 1.2} color="white" strokeWidth={2.4} />
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
