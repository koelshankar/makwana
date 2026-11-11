"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Point } from "@/domain/types";
import type { ViewBox } from "./plan-geometry";

/**
 * Fit-to-box SVG viewport with zoom about a point. `view` is null while fitted to `fit`.
 * `px` is millimetres per screen pixel, for constant-size strokes, text and hit thresholds.
 */
export function usePlanViewport(fit: ViewBox, limits = { min: 0.3, max: 8 }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [view, setView] = useState<{ zoom: number; cx: number; cy: number } | null>(null);
  const zoom = view?.zoom ?? 1;
  const cx = view?.cx ?? fit.x + fit.w / 2;
  const cy = view?.cy ?? fit.y + fit.h / 2;
  const aspect = size.w / Math.max(1, size.h);
  let vw = fit.w / zoom;
  let vh = fit.h / zoom;
  if (vw / vh < aspect) vw = vh * aspect;
  else vh = vw / aspect;
  const vb: ViewBox = { x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh };
  const px = vw / Math.max(1, size.w);

  const zoomAt = (factor: number, p: Point = { x: cx, y: cy }) => {
    const next = Math.min(limits.max, Math.max(limits.min, zoom * factor));
    const f = next / zoom;
    setView({ zoom: next, cx: p.x + (cx - p.x) / f, cy: p.y + (cy - p.y) / f });
  };

  /** Screen point to SVG user units (world mm). */
  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: q.x, y: q.y };
  };

  return { boxRef, svgRef, size, view, setView, zoom, cx, cy, vb, px, zoomAt, toWorld };
}
