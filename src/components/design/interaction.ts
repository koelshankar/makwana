// Ephemeral Design-screen interaction state: drags, ghosts and drop outcomes. None of this is
// project data: it never touches the project store, so previews never reach undo history.

import { create } from "zustand";
import type { WallSlot } from "@/domain/geometry";
import type { SnapKind } from "@/domain/snapping";
import type { Anchor, CheckResult, Placement, Project } from "@/domain/types";

export type DragItem =
  | { kind: "new"; moduleCode: string }
  | { kind: "newAppliance"; applianceId: string }
  | { kind: "move"; placementId: string; grabMm: number }
  | { kind: "nudge"; placementId: string };

export interface Ghost {
  item: DragItem;
  /**
   * What would be placed: a unit, a free appliance, an appliance fitted into a host, or a
   * fitted-type appliance dropped loose (blocked). New ones carry the id GHOST_ID until committed.
   */
  candidate: Placement;
  /** Where it shows on the wall: a fitted appliance shows as its host's slot. */
  slot: WallSlot;
  /** Height band, mm above the floor. */
  z: [number, number];
  /** Module code or appliance name. */
  label: string;
  status: "pass" | "blocked";
  reason: string | null;
  gaps: { left: number | null; right: number | null };
  snap: SnapKind | "host";
}

export const GHOST_ID = "__ghost__";

export interface ClientPoint {
  x: number;
  y: number;
}

/** What happened on drop, shown next to the drop point until the project changes. */
export type Outcome =
  | { kind: "blocked"; candidate: Placement; isNew: boolean; results: CheckResult[]; at: ClientPoint; project: Project }
  | { kind: "warning"; placementId: string; results: CheckResult[]; at: ClientPoint; project: Project };

/** Registered by the visible elevation so drags from outside it can be resolved there. */
export interface ElevationApi {
  wallId: string;
  /** Ghost for a pointer position, or null if the pointer isn't over the elevation. */
  resolve: (pointer: ClientPoint, item: DragItem, magnets: boolean) => Ghost | null;
  /** Ghost for a unit or free appliance nudged to an offset (keyboard). */
  resolveAt: (placement: Placement, offsetMm: number) => Ghost;
  /** Screen point at a wall offset and height, for anchoring cards. */
  locate: (offsetMm: number, zMm: number) => ClientPoint;
}

/** A checks-popover row being pointed at: its anchor is highlighted until the project changes. */
export interface Highlight {
  anchor: Anchor;
  kind: "gap" | "corner";
  project: Project;
}

/** Ask the 3D view to frame some units or a wall region; `n` makes repeated requests distinct. */
export interface FrameRequest {
  placementIds: string[];
  anchor?: Anchor;
  n: number;
}

interface Interaction {
  item: DragItem | null;
  pointer: ClientPoint | null;
  ghost: Ghost | null;
  outcome: Outcome | null;
  elevation: ElevationApi | null;
  highlight: Highlight | null;
  frameRequest: FrameRequest | null;
  set: (patch: Partial<Omit<Interaction, "set">>) => void;
}

export const useInteraction = create<Interaction>((set) => ({
  item: null,
  pointer: null,
  ghost: null,
  outcome: null,
  elevation: null,
  highlight: null,
  frameRequest: null,
  set: (patch) => set(patch),
}));
