import { useMemo, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import { catalogue, getModule } from "@/domain/catalogue";
import { applyFix, withPlacement, withoutPlacement } from "@/domain/fixes";
import { finishGroup, inheritedFinish, type FinishChoice, type FinishGroup } from "@/domain/finish-defaults";
import { defaultBlindSide, findPlacement, placementToWorldBox, type WorldBox } from "@/domain/geometry";
import { priceProject } from "@/domain/pricing";
import { checkCandidate, hasBlocked, runAllChecks, runRawChecks } from "@/domain/rules";
import { validateRoom } from "@/domain/room-validation";
import { sampleDesign } from "@/domain/seed";
import type {
  AppliancePlacement,
  CheckResult,
  Feature,
  Fix,
  Heading,
  ModulePlacement,
  Project,
  ProjectStatus,
  Wall,
} from "@/domain/types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewFeature = DistributiveOmit<Feature, "id">;
export type FeaturePatch = Partial<DistributiveOmit<Feature, "id" | "kind">>;
export type NewModule = Omit<ModulePlacement, "id"> & { id?: string };
export type NewAppliance = DistributiveOmit<AppliancePlacement, "id"> & { id?: string };
export type NewWall = Omit<Wall, "id">;
export type PlacementPatch = Partial<Pick<ModulePlacement, "carcassId" | "finishId" | "shutterTypeId" | "hardware" | "blindSide">>;
export type ProjectInfo = Partial<Pick<Project, "name" | "customerName" | "siteAddress" | "kitchenType">>;

export interface PlaceResult {
  ok: boolean;
  id: string;
  results: CheckResult[];
}

export const HISTORY_LIMIT = 50;

export type DesignTab = "plan" | "wall";

/**
 * View state shared between views: never in undo history, never persisted. Drag previews and
 * hover state are not here either; they live in component state and never touch the store.
 */
export interface UiState {
  selectedPlacementId: string | null;
  /** The wall whose elevation is shown (and where units from the catalogue are dropped). */
  activeWallId: string | null;
  designTab: DesignTab;
  elevationZoom: number;
  /** Last finish/shutter chosen per group; new units inherit it. */
  recentFinish: Partial<Record<FinishGroup, FinishChoice>>;
}

export const initialUi: UiState = {
  selectedPlacementId: null,
  activeWallId: null,
  designTab: "wall",
  elevationZoom: 1,
  recentFinish: {},
};

export interface ProjectState {
  project: Project;
  ui: UiState;
  /** Undo/redo snapshots of `project`. Immer's structural sharing keeps these cheap. */
  past: Project[];
  future: Project[];

  /** Replaces the project and clears history (demo menu, "new project"). */
  loadProject: (project: Project) => void;
  undo: () => void;
  redo: () => void;

  setProjectInfo: (info: ProjectInfo) => void;
  addWall: (wall: NewWall) => string;
  /** Appends several walls as one undoable step (used by "Close room"). */
  appendWalls: (walls: NewWall[]) => void;
  /** Replaces every wall (templates). Features and placements are kept for the rules to re-check. */
  replaceWalls: (walls: NewWall[]) => void;
  updateWall: (id: string, patch: Partial<NewWall>) => void;
  /** Also removes the wall's features and everything placed on it. */
  removeWall: (id: string) => void;
  setCeiling: (mm: number) => void;
  addFeature: (feature: NewFeature) => string;
  updateFeature: (id: string, patch: FeaturePatch) => void;
  removeFeature: (id: string) => void;

  /** Commits only if nothing is blocked; returns the check results either way. */
  tryPlaceModule: (module: NewModule) => PlaceResult;
  /**
   * Places (or moves) a unit and applies one of its suggested fixes, as one undoable step.
   * Commits only if nothing involving the unit is still blocked afterwards.
   */
  placeWithFix: (module: NewModule, fix: Fix) => PlaceResult;
  /** Same behaviour as tryPlaceModule. Fitted appliances move with their host. */
  movePlacement: (id: string, wallId: string, offsetMm: number) => PlaceResult;
  /** Finish, shutter, hardware and blind side. Returns false if a hardware item isn't allowed on the module. */
  updatePlacement: (id: string, patch: PlacementPatch) => boolean;
  removePlacement: (id: string) => void;
  tryPlaceAppliance: (appliance: NewAppliance) => PlaceResult;
  removeAppliance: (id: string) => void;

  applyFix: (fix: Fix) => void;
  setDiscount: (pct: number) => void;
  setStatus: (status: ProjectStatus) => void;
  /** Selects a unit and makes its wall the active elevation. */
  select: (id: string | null) => void;
  /** Shows a wall's elevation. */
  showWall: (wallId: string) => void;
  setDesignTab: (tab: DesignTab) => void;
  setElevationZoom: (zoom: number) => void;
  /** Finish and shutter for a new unit of this module, inherited from its group. */
  finishFor: (moduleCode: string) => FinishChoice;
}

function nextId(project: Project, prefix: string): string {
  const taken = new Set([...project.modules, ...project.appliances].map((p) => p.id));
  let n = project.modules.length + project.appliances.length + 1;
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** Blind corner units default to the side facing the nearer corner; other units have no blind side. */
function normaliseBlindSide(project: Project, p: ModulePlacement): ModulePlacement {
  if (!getModule(catalogue, p.moduleCode).hasBlindSide) {
    const rest = { ...p };
    delete rest.blindSide;
    return rest;
  }
  return p.blindSide ? p : { ...p, blindSide: defaultBlindSide(project.room, p.wallId, p.offsetMm, p.widthMm) };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function nextWallLetter(walls: Wall[]): string {
  const taken = new Set(walls.map((w) => w.id));
  const letter = LETTERS.find((l) => !taken.has(l));
  if (!letter) throw new Error("A room can have at most 26 walls");
  return letter;
}

export const HEADING_NAMES: Record<Heading, string> = { N: "North", E: "East", S: "South", W: "West" };

function nextFeatureId(project: Project, kind: string): string {
  const taken = new Set(project.room.features.map((f) => f.id));
  let n = 1;
  while (taken.has(`f-${kind}-${n}`)) n++;
  return `f-${kind}-${n}`;
}

/** Storage for persist: localStorage in the browser, nothing on the server or in tests. */
const noStorage: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const browserStorage = () => (typeof window === "undefined" ? noStorage : window.localStorage);

export const PERSIST_KEY = "makwana:project";
export const PERSIST_VERSION = 2;

export function createProjectStore(initial: Project, storage: () => StateStorage = () => noStorage) {
  return createStore<ProjectState>()(
    persist(
      immer((set, get) => {
        /** Applies an undoable project edit; records history only if the project changed. */
        const edit = (fn: (project: Project) => void) => {
          const before = get().project;
          set((s) => {
            fn(s.project);
          });
          if (get().project === before) return;
          set((s) => {
            s.past.push(before);
            if (s.past.length > HISTORY_LIMIT) s.past.shift();
            s.future = [];
          });
        };
        /** Replaces the project as one undoable step. */
        const replace = (next: Project) => edit((draft) => Object.assign(draft, next));

        const clearMissingSelection = () =>
          set((s) => {
            const id = s.ui.selectedPlacementId;
            if (id && !findPlacement(s.project, id)) s.ui.selectedPlacementId = null;
          });

        const rememberFinish = (p: Pick<ModulePlacement, "moduleCode" | "finishId" | "shutterTypeId" | "layer">) => {
          const mod = getModule(catalogue, p.moduleCode);
          if (mod.family === "FIL") return;
          set((s) => {
            s.ui.recentFinish[finishGroup(p.layer)] = { finishId: p.finishId, shutterTypeId: p.shutterTypeId };
          });
        };

        const selectPlacement = (id: string | null) =>
          set((s) => {
            s.ui.selectedPlacementId = id;
            const p = id ? findPlacement(s.project, id) : undefined;
            if (!p) return;
            const wallId =
              "wallId" in p ? p.wallId : s.project.modules.find((m) => m.id === p.hostPlacementId)?.wallId;
            if (wallId) s.ui.activeWallId = wallId;
          });

        const newPlacement = (project: Project, module: NewModule): ModulePlacement =>
          normaliseBlindSide(project, { ...module, id: module.id ?? nextId(project, module.moduleCode) });

        return {
          project: initial,
          ui: initialUi,
          past: [],
          future: [],

          loadProject: (project) =>
            set((s) => {
              s.project = project;
              s.ui = initialUi;
              s.past = [];
              s.future = [];
            }),
          undo: () => {
            const { past, project } = get();
            if (!past.length) return;
            set((s) => {
              s.future.push(project);
              s.project = s.past.pop()!;
            });
            clearMissingSelection();
          },
          redo: () => {
            const { future, project } = get();
            if (!future.length) return;
            set((s) => {
              s.past.push(project);
              s.project = s.future.pop()!;
            });
            clearMissingSelection();
          },

          setProjectInfo: (info) => edit((p) => Object.assign(p, info)),

          addWall: (wall) => {
            const id = nextWallLetter(get().project.room.walls);
            edit((p) => {
              p.room.walls.push({ ...wall, id });
            });
            return id;
          },
          appendWalls: (walls) =>
            edit((p) => {
              for (const wall of walls) p.room.walls.push({ ...wall, id: nextWallLetter(p.room.walls) });
            }),
          replaceWalls: (walls) =>
            edit((p) => {
              p.room.walls = walls.map((w, i) => ({ ...w, id: LETTERS[i] }));
            }),
          updateWall: (id, patch) =>
            edit((p) => {
              const wall = p.room.walls.find((w) => w.id === id);
              if (wall) Object.assign(wall, patch);
            }),
          removeWall: (id) => {
            edit((p) => {
              const room = p.room;
              room.walls = room.walls.filter((w) => w.id !== id);
              room.features = room.features.filter((f) => !("wallId" in f) || f.wallId !== id);
              const removed = new Set(p.modules.filter((m) => m.wallId === id).map((m) => m.id));
              p.modules = p.modules.filter((m) => !removed.has(m.id));
              p.appliances = p.appliances.filter((a) =>
                a.kind === "hosted" ? !removed.has(a.hostPlacementId) : a.wallId !== id,
              );
            });
            clearMissingSelection();
          },
          setCeiling: (mm) =>
            edit((p) => {
              p.room.ceilingHeightMm = mm;
            }),
          addFeature: (feature) => {
            const id = nextFeatureId(get().project, feature.kind);
            edit((p) => {
              p.room.features.push({ ...feature, id } as Feature);
            });
            return id;
          },
          updateFeature: (id, patch) =>
            edit((p) => {
              const feature = p.room.features.find((f) => f.id === id);
              if (feature) Object.assign(feature, patch);
            }),
          removeFeature: (id) =>
            edit((p) => {
              p.room.features = p.room.features.filter((f) => f.id !== id);
            }),

          tryPlaceModule: (module) => {
            const { project } = get();
            const placement = newPlacement(project, module);
            const results = checkCandidate(project, catalogue, placement);
            const ok = !hasBlocked(results);
            if (ok) {
              edit((p) => {
                p.modules.push(placement);
              });
              selectPlacement(placement.id);
              rememberFinish(placement);
            }
            return { ok, id: placement.id, results };
          },
          placeWithFix: (module, fix) => {
            const { project } = get();
            const placement = newPlacement(project, module);
            let after: Project;
            try {
              after = applyFix(withPlacement(project, placement), catalogue, fix.action);
            } catch {
              return { ok: false, id: placement.id, results: [] };
            }
            // A replace fix keeps the id; a remove fix would take the unit away entirely.
            const placed = after.modules.find((m) => m.id === placement.id);
            const results = placed ? checkCandidate(after, catalogue, placed) : [];
            const ok = !!placed && !hasBlocked(results);
            if (ok) {
              replace(after);
              selectPlacement(placement.id);
              rememberFinish(placed);
            }
            return { ok, id: placement.id, results };
          },
          movePlacement: (id, wallId, offsetMm) => {
            const { project } = get();
            const mod = project.modules.find((m) => m.id === id);
            const app = project.appliances.find((a) => a.id === id);
            const moved = mod ? { ...mod, wallId, offsetMm } : app?.kind === "free" ? { ...app, wallId, offsetMm } : undefined;
            if (!moved) return { ok: false, id, results: [] };
            const results = checkCandidate(project, catalogue, moved);
            const ok = !hasBlocked(results);
            if (ok) {
              edit((p) => {
                const target = p.modules.find((m) => m.id === id) ?? p.appliances.find((a) => a.id === id);
                if (target && "offsetMm" in target) {
                  target.wallId = wallId;
                  target.offsetMm = offsetMm;
                }
              });
            }
            return { ok, id, results };
          },
          updatePlacement: (id, patch) => {
            const mod = get().project.modules.find((m) => m.id === id);
            if (!mod) return false;
            const spec = getModule(catalogue, mod.moduleCode);
            if (patch.hardware && patch.hardware.some((h) => !spec.allowedHardwareIds.includes(h.itemId) || h.qty < 1)) return false;
            if (patch.blindSide && !spec.hasBlindSide) return false;
            edit((p) => {
              const target = p.modules.find((m) => m.id === id);
              if (target) Object.assign(target, patch);
            });
            if (patch.finishId || patch.shutterTypeId) rememberFinish(get().project.modules.find((m) => m.id === id)!);
            return true;
          },
          removePlacement: (id) => {
            replace(withoutPlacement(get().project, id));
            clearMissingSelection();
          },
          tryPlaceAppliance: (appliance) => {
            const { project } = get();
            const placement = { ...appliance, id: appliance.id ?? nextId(project, appliance.applianceId) } as AppliancePlacement;
            const results = checkCandidate(project, catalogue, placement);
            const ok = !hasBlocked(results);
            if (ok) {
              edit((p) => {
                p.appliances.push(placement);
              });
            }
            return { ok, id: placement.id, results };
          },
          removeAppliance: (id) => {
            edit((p) => {
              p.appliances = p.appliances.filter((a) => a.id !== id);
            });
            clearMissingSelection();
          },

          applyFix: (fix) => {
            replace(applyFix(get().project, catalogue, fix.action));
            clearMissingSelection();
          },
          setDiscount: (pct) =>
            edit((p) => {
              p.discountPct = pct;
            }),
          setStatus: (status) =>
            edit((p) => {
              p.status = status;
            }),
          select: selectPlacement,
          showWall: (wallId) =>
            set((s) => {
              s.ui.activeWallId = wallId;
              s.ui.designTab = "wall";
            }),
          setDesignTab: (tab) =>
            set((s) => {
              s.ui.designTab = tab;
            }),
          setElevationZoom: (zoom) =>
            set((s) => {
              s.ui.elevationZoom = Math.min(4, Math.max(0.5, zoom));
            }),
          finishFor: (moduleCode) => inheritedFinish(get().project, catalogue, moduleCode, get().ui.recentFinish),
        };
      }),
      {
        name: PERSIST_KEY,
        version: PERSIST_VERSION,
        storage: createJSONStorage(storage),
        partialize: (s) => ({ project: s.project }),
        // A stored project from another version may not match today's types: start from the seed.
        migrate: () => ({ project: initial }),
        // Rehydrated on the client after mount, so server and first client render agree.
        skipHydration: true,
      },
    ),
  );
}

export type ProjectStore = ReturnType<typeof createProjectStore>;

/** The app's single project store. Starts on the sample design for the demo. */
export const projectStore = createProjectStore(sampleDesign, browserStorage);

export function useProjectStore<T>(selector: (state: ProjectState) => T): T {
  return useStore(projectStore, selector);
}

/** True once the saved project has been restored (or there was none). Screens wait for it. */
export function useHydrated(store: ProjectStore = projectStore): boolean {
  return useSyncExternalStore(
    (onChange) => store.persist.onFinishHydration(onChange),
    () => store.persist.hasHydrated(),
    () => false,
  );
}

// ---------------------------------------------------------------------------
// Derived hooks. Immer keeps `project` referentially stable until it changes, so these
// recompute only on real edits.

export function useChecks(): CheckResult[] {
  const project = useProjectStore((s) => s.project);
  return useMemo(() => runAllChecks(project, catalogue), [project]);
}

/** Cheap: no fix validation. For gating navigation. */
export function useHasBlocked(): boolean {
  return hasBlocked(useRawChecks());
}

/** Every rule's results without fix validation: cheap, for chips, lists and outlines. */
export function useRawChecks(): CheckResult[] {
  const project = useProjectStore((s) => s.project);
  return useMemo(() => runRawChecks(project, catalogue), [project]);
}

/** Ids of placements involved in a blocked result. */
export function useBlockedIds(): Set<string> {
  const raw = useRawChecks();
  return useMemo(() => new Set(raw.filter((r) => r.status === "blocked").flatMap((r) => r.placementIds)), [raw]);
}

export function useRoomValidation() {
  const room = useProjectStore((s) => s.project.room);
  return useMemo(() => validateRoom(room), [room]);
}

export function usePricing() {
  const project = useProjectStore((s) => s.project);
  return useMemo(() => priceProject(project, catalogue), [project]);
}

/** World boxes for every placement, keyed by id. Placements with a missing wall or host are skipped. */
export function useWorldBoxes(): Map<string, WorldBox> {
  const project = useProjectStore((s) => s.project);
  return useMemo(() => worldBoxes(project), [project]);
}

export function worldBoxes(project: Project): Map<string, WorldBox> {
  const boxes = new Map<string, WorldBox>();
  for (const p of [...project.modules, ...project.appliances]) {
    try {
      boxes.set(p.id, placementToWorldBox(project, p, catalogue));
    } catch {
      // Reported by the rules.
    }
  }
  return boxes;
}
