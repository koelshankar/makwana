// Ephemeral Design-screen interaction state: drags, ghosts and drop outcomes. None of this is
// project data: it never touches the project store, so previews never reach undo history.

import { create } from "zustand";
import type { SnapKind } from "@/domain/snapping";
import type { CheckResult, ModulePlacement, Project } from "@/domain/types";

export type DragItem =
  | { kind: "new"; moduleCode: string }
  | { kind: "move"; placementId: string; grabMm: number }
  | { kind: "nudge"; placementId: string };

export interface Ghost {
  item: DragItem;
  /** The unit as it would be placed. New units carry the id GHOST_ID until committed. */
  candidate: ModulePlacement;
  status: "pass" | "blocked";
  reason: string | null;
  gaps: { left: number | null; right: number | null };
  snap: SnapKind;
}

export const GHOST_ID = "__ghost__";

export interface ClientPoint {
  x: number;
  y: number;
}

/** What happened on drop, shown next to the drop point until the project changes. */
export type Outcome =
  | { kind: "blocked"; candidate: ModulePlacement; isNew: boolean; results: CheckResult[]; at: ClientPoint; project: Project }
  | { kind: "warning"; placementId: string; results: CheckResult[]; at: ClientPoint; project: Project };

/** Registered by the visible elevation so drags from outside it can be resolved there. */
export interface ElevationApi {
  wallId: string;
  /** Ghost for a pointer position, or null if the pointer isn't over the elevation. */
  resolve: (pointer: ClientPoint, item: DragItem, magnets: boolean) => Ghost | null;
  /** Ghost for a unit nudged to an offset (keyboard). */
  resolveAt: (placement: ModulePlacement, offsetMm: number) => Ghost;
  /** Screen point at a wall offset and height, for anchoring cards. */
  locate: (offsetMm: number, zMm: number) => ClientPoint;
}

interface Interaction {
  item: DragItem | null;
  pointer: ClientPoint | null;
  ghost: Ghost | null;
  outcome: Outcome | null;
  elevation: ElevationApi | null;
  set: (patch: Partial<Omit<Interaction, "set">>) => void;
}

export const useInteraction = create<Interaction>((set) => ({
  item: null,
  pointer: null,
  ghost: null,
  outcome: null,
  elevation: null,
  set: (patch) => set(patch),
}));
