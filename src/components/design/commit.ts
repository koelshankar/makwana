// Turning a ghost (drop, move release, nudge release) into a store action, and showing what happened.

import type { Fix, ModulePlacement } from "@/domain/types";
import { projectStore, type PlaceResult } from "@/store/project-store";
import { GHOST_ID, useInteraction, type ClientPoint, type Ghost } from "./interaction";

/** Blocked results first, and among those the ones with fixes, so the card leads with something actionable. */
const blockedFirst = (results: PlaceResult["results"]) => {
  const rank = (r: PlaceResult["results"][number]) => (r.status === "blocked" ? 0 : 2) + (r.fixes.length ? 0 : 1);
  return [...results].sort((a, b) => rank(a) - rank(b));
};

function show(res: PlaceResult, candidate: ModulePlacement, isNew: boolean, at: ClientPoint, before = projectStore.getState().project) {
  const { set } = useInteraction.getState();
  if (!res.ok) {
    set({ outcome: { kind: "blocked", candidate: { ...candidate, id: res.id }, isNew, results: blockedFirst(res.results), at, project: before } });
    return;
  }
  projectStore.getState().select(res.id);
  const warnings = res.results.filter((r) => r.status === "warning");
  set({
    outcome: warnings.length
      ? { kind: "warning", placementId: res.id, results: warnings, at, project: projectStore.getState().project }
      : null,
  });
}

/** Drop or release: full checks, then commit, warn, or show the blocked card. Nothing is committed if blocked. */
export function commitGhost(ghost: Ghost, at: ClientPoint) {
  const store = projectStore.getState();
  const before = store.project;
  const c = ghost.candidate;
  if (ghost.item.kind === "new") {
    const draft: Partial<ModulePlacement> = { ...c };
    delete draft.id;
    show(store.tryPlaceModule(draft as Omit<ModulePlacement, "id">), c, true, at, before);
    return;
  }
  const current = before.modules.find((m) => m.id === c.id);
  if (!current || (current.wallId === c.wallId && current.offsetMm === c.offsetMm)) return;
  show(store.movePlacement(c.id, c.wallId, c.offsetMm), c, false, at, before);
}

/** A suggested fix on the blocked card: place the unit with the fix applied, as one step. */
export function placeWithFix(candidate: ModulePlacement, isNew: boolean, fix: Fix, at: ClientPoint) {
  const before = projectStore.getState().project;
  show(projectStore.getState().placeWithFix(candidate, fix), candidate, isNew, at, before);
}

/** A fix on the amber warning note: the unit is already placed. */
export function applyWarningFix(fix: Fix) {
  projectStore.getState().applyFix(fix);
  useInteraction.getState().set({ outcome: null });
}

export const isGhostId = (id: string) => id === GHOST_ID;
