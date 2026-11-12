import { useMemo, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { createJSONStorage, persist, type PersistStorage, type StateStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import { catalogue, getModule } from "@/domain/catalogue";
import { applyFix, withPlacement, withoutPlacement } from "@/domain/fixes";
import { finishGroup, inheritedFinish, type FinishChoice, type FinishGroup } from "@/domain/finish-defaults";
import { defaultBlindSide, findPlacement, isModulePlacement, placementToWorldBox, type WorldBox } from "@/domain/geometry";
import { priceProject } from "@/domain/pricing";
import { checkCandidate, hasBlocked, issueKey, runAllChecks, runRawChecks } from "@/domain/rules";
import { validateRoom } from "@/domain/room-validation";
import { approvalItems, approve, createQuote, designChanged, MANAGER_NAME, markPdfDownloaded, markShared, returnToDraft, sendBack, sendForApproval, type ApprovalMode } from "@/domain/quote";
import { isUsableProject } from "@/domain/project-validation";
import { emptyMehta, sampleDesign } from "@/domain/seed";
import type { WallHeightMode } from "@/domain/three-model";
import type {
  AppliancePlacement,
  CheckResult,
  Feature,
  Fix,
  Heading,
  ModulePlacement,
  Placement,
  Project,
  ProjectStatus,
  SuppliedBy,
  Wall,
} from "@/domain/types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewFeature = DistributiveOmit<Feature, "id">;
export type FeaturePatch = Partial<DistributiveOmit<Feature, "id" | "kind">>;
export type NewModule = Omit<ModulePlacement, "id"> & { id?: string };
export type NewAppliance = DistributiveOmit<AppliancePlacement, "id"> & { id?: string };
export type NewPlacement = NewModule | NewAppliance;
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
  /** 3D walls: cut low so the kitchen shows from any angle, or full height. */
  wallHeight: WallHeightMode;
  /** The 3D view fills the screen for the customer, with only view controls. */
  customerView: boolean;
  /** The Quote screen's 3D picture at the iso preset, handed to the print page. Never persisted. */
  snapshot: string | null;
  /** Set when an edit sends a pending or approved quote back to draft, for the toast. */
  returnedToDraft: { version: number; n: number } | null;
  /**
   * Why the saved project was replaced on load, for the toast: `unreadable` (failed validation or
   * restoring threw; the empty Mehta room was loaded) or `old-version` (saved by another version of
   * the app; the sample design was loaded). Null when the save was used as it was.
   */
  restoreNotice: RestoreNotice | null;
}

/**
 * Demo settings: who is using the app and how approval works. Kept when a project is loaded and
 * persisted with it, never in undo history.
 */
export interface Settings {
  role: Role;
  approvalMode: ApprovalMode;
  /** Next quote sequence number for this store. */
  nextQuoteSeq: number;
  /** 3D at device pixel ratio 1, without contact shadows or edge lines, for slow machines. */
  performanceMode: boolean;
  /** Performance mode was switched on automatically once; it isn't offered again. */
  performanceAutoSwitched: boolean;
}

export type Role = "salesperson" | "manager";

export type RestoreNotice = "unreadable" | "old-version";

export const initialSettings: Settings = {
  role: "salesperson",
  approvalMode: "always",
  nextQuoteSeq: 147,
  performanceMode: false,
  performanceAutoSwitched: false,
};

export const initialUi: UiState = {
  selectedPlacementId: null,
  activeWallId: null,
  designTab: "wall",
  elevationZoom: 1,
  recentFinish: {},
  wallHeight: "cut",
  customerView: false,
  snapshot: null,
  returnedToDraft: null,
  restoreNotice: null,
};

export interface ProjectState {
  project: Project;
  ui: UiState;
  settings: Settings;
  /** Undo/redo snapshots of `project`. Immer's structural sharing keeps these cheap. */
  past: Project[];
  future: Project[];
  /**
   * Restoring the saved project threw, and the empty Mehta room was loaded instead. Screens treat
   * the store as restored (persist's own flag stays false after an error). Never persisted.
   */
  restoreErrored: boolean;
  /** The fallback when restoring throws: the empty Mehta room, with the "couldn't be opened" toast. */
  recoverFromRestoreError: () => void;

  /** Replaces the project and clears history (demo menu, "new project"). */
  loadProject: (project: Project) => void;
  /** Empty Mehta room, default settings (quote sequence 0147) and view state, no history. */
  resetDemo: () => void;
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
   * Places (or moves) a unit or appliance and applies one of its suggested fixes, as one
   * undoable step. Commits only if nothing involving it is still blocked afterwards and the fix
   * added no new blocked issue (a fix may place a host unit too).
   */
  placeWithFix: (candidate: NewPlacement, fix: Fix) => PlaceResult;
  /** Same behaviour as tryPlaceModule. Fitted appliances move with their host. */
  movePlacement: (id: string, wallId: string, offsetMm: number) => PlaceResult;
  /** Finish, shutter, hardware and blind side. Returns false if a hardware item isn't allowed on the module. */
  updatePlacement: (id: string, patch: PlacementPatch) => boolean;
  removePlacement: (id: string) => void;
  /** Same behaviour as tryPlaceModule, for a fitted (hosted) or free appliance. */
  tryPlaceAppliance: (appliance: NewAppliance) => PlaceResult;
  removeAppliance: (id: string) => void;
  setSuppliedBy: (id: string, by: SuppliedBy) => void;

  applyFix: (fix: Fix) => void;
  /** Logged; above the salesperson limit it raises the approval check. */
  setDiscount: (pct: number) => void;
  setStatus: (status: ProjectStatus) => void;

  // Quote workflow. These never enter undo history: undo changes the design, not the paperwork.
  /**
   * Gives the project its quote number (version 1), once. Called only when the quote leaves the
   * salesperson: sent for approval, shared or downloaded. Until then it is a draft without a number.
   */
  ensureQuote: () => void;
  /** Assigns the quote number first if there isn't one. */
  sendForApproval: () => void;
  approve: () => void;
  /** Needs a comment; the salesperson sees it as a banner. */
  sendBack: (comment: string) => void;
  markShared: (how: string) => void;
  /** Download PDF: a share if the quote is final, otherwise a draft download (see isQuoteFinal). */
  markPdfDownloaded: () => void;
  setRole: (role: Role) => void;
  setApprovalMode: (mode: ApprovalMode) => void;
  setSnapshot: (dataUrl: string | null) => void;
  /** `auto` marks the one-time automatic switch after slow frames. */
  setPerformanceMode: (on: boolean, auto?: boolean) => void;
  clearRestoreNotice: () => void;
  /** Selects a unit and makes its wall the active elevation. */
  select: (id: string | null) => void;
  /** Shows a wall's elevation. */
  showWall: (wallId: string) => void;
  setDesignTab: (tab: DesignTab) => void;
  setElevationZoom: (zoom: number) => void;
  setWallHeight: (mode: WallHeightMode) => void;
  setCustomerView: (on: boolean) => void;
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

const saveFailedListeners = new Set<() => void>();

/** Called when saving starts failing (once per run of failures; a good save resets it). */
export function onSaveFailed(listener: () => void): () => void {
  saveFailedListeners.add(listener);
  return () => saveFailedListeners.delete(listener);
}

const notifySaveFailed = () => saveFailedListeners.forEach((l) => l());

type WebStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Storage that never throws: blocked storage reads as empty, and a full one skips the save and
 * reports it (quota or privacy mode), so the screen can say the project isn't being saved.
 */
export function guardedStorage(ls: WebStorage, saveFailed: () => void = notifySaveFailed): StateStorage {
  let failing = false;
  return {
    getItem: (k) => ls.getItem(k),
    setItem: (k, v) => {
      try {
        ls.setItem(k, v);
        failing = false;
      } catch {
        if (!failing) saveFailed();
        failing = true;
      }
    },
    removeItem: (k) => {
      try {
        ls.removeItem(k);
      } catch {
        // Blocked storage: nothing to clear.
      }
    },
  };
}

/** localStorage in the browser; nothing on the server, or when storage can't be reached at all. */
const browserStorage = (): StateStorage => {
  if (typeof window === "undefined") return noStorage;
  try {
    return guardedStorage(window.localStorage);
  } catch {
    return noStorage;
  }
};

export const PERSIST_KEY = "makwana:project";
export const PERSIST_VERSION = 2;

type Saved = Pick<ProjectState, "project" | "settings">;

/** What migrate hands to merge: a save from another version, already replaced by the seed. */
type Migrated = Saved & { replaced?: true };

/** JSON storage where an unreadable save comes back as an unusable one, so `merge` replaces it. */
function safeJSONStorage(storage: () => StateStorage): PersistStorage<Saved> {
  const json = createJSONStorage<Saved>(storage)!;
  return {
    ...json,
    getItem: (name) => {
      try {
        return json.getItem(name);
      } catch {
        return { state: {} as Saved, version: PERSIST_VERSION };
      }
    },
  };
}

const ROLES: Role[] = ["salesperson", "manager"];
const APPROVAL_MODES: ApprovalMode[] = ["always", "flagged"];

/** Saved settings field by field; anything missing or malformed keeps its default. */
function restoreSettings(saved: unknown, defaults: Settings): Settings {
  const s = (typeof saved === "object" && saved !== null ? saved : {}) as Partial<Record<keyof Settings, unknown>>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    role: ROLES.includes(s.role as Role) ? (s.role as Role) : defaults.role,
    approvalMode: APPROVAL_MODES.includes(s.approvalMode as ApprovalMode) ? (s.approvalMode as ApprovalMode) : defaults.approvalMode,
    nextQuoteSeq: Number.isInteger(s.nextQuoteSeq) && (s.nextQuoteSeq as number) > 0 ? (s.nextQuoteSeq as number) : defaults.nextQuoteSeq,
    performanceMode: bool(s.performanceMode, defaults.performanceMode),
    performanceAutoSwitched: bool(s.performanceAutoSwitched, defaults.performanceAutoSwitched),
  };
}

export function createProjectStore(initial: Project, storage: () => StateStorage = () => noStorage, now: () => string = () => new Date().toISOString()) {
  return createStore<ProjectState>()(
    persist(
      immer((set, get) => {
        /** Applies an undoable project edit; records history only if the project changed. */
        /** The person acting now, for the activity log. */
        const actor = () => (get().settings.role === "manager" ? MANAGER_NAME : get().project.preparedBy);

        /** Workflow change outside undo history. */
        const workflow = (fn: (project: Project) => Project) => {
          const next = fn(get().project);
          if (next === get().project) return;
          set((s) => {
            s.project = next;
          });
        };

        /**
         * Applies an undoable project edit; records history only if the project changed. A change to
         * the design, room or discount of a pending or approved quote sends it back to draft (a new
         * version if it was approved), in the same step.
         */
        const edit = (fn: (project: Project) => void) => {
          const before = get().project;
          set((s) => {
            fn(s.project);
          });
          const after = get().project;
          if (after === before) return;
          if (before.status !== "draft" && designChanged(before, after)) {
            const back = returnToDraft(after, now(), actor());
            set((s) => {
              s.project = back;
              s.ui.returnedToDraft = { version: back.quote?.version ?? 1, n: (s.ui.returnedToDraft?.n ?? 0) + 1 };
            });
          }
          set((s) => {
            s.past.push(before);
            if (s.past.length > HISTORY_LIMIT) s.past.shift();
            s.future = [];
          });
        };

        /**
         * Undo and redo restore the design but keep the quote's status, version and log as they are
         * now; if that changes the design of a pending or approved quote, it goes back to draft.
         */
        const keepWorkflow = (snapshot: Project, current: Project): Project => {
          const { quote, activity, status } = current;
          if (snapshot.quote === quote && snapshot.activity === activity && snapshot.status === status) return snapshot;
          let out: Project = { ...snapshot, status };
          if (quote) out.quote = quote;
          else delete out.quote;
          if (activity) out.activity = activity;
          else delete out.activity;
          if (status !== "draft" && designChanged(current, out)) {
            out = returnToDraft(out, now(), actor());
            const version = out.quote?.version ?? 1;
            queueMicrotask(() =>
              set((s) => {
                s.ui.returnedToDraft = { version, n: (s.ui.returnedToDraft?.n ?? 0) + 1 };
              }),
            );
          }
          return out;
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
          settings: initialSettings,
          past: [],
          future: [],
          restoreErrored: false,

          recoverFromRestoreError: () =>
            set((s) => {
              s.project = emptyMehta;
              s.ui = { ...initialUi, restoreNotice: "unreadable" };
              s.past = [];
              s.future = [];
              s.restoreErrored = true;
            }),

          loadProject: (project) =>
            set((s) => {
              s.project = project;
              s.ui = initialUi;
              s.past = [];
              s.future = [];
            }),
          resetDemo: () =>
            set((s) => {
              s.project = emptyMehta;
              s.ui = initialUi;
              s.settings = initialSettings;
              s.past = [];
              s.future = [];
            }),
          undo: () => {
            const { past, project } = get();
            if (!past.length) return;
            set((s) => {
              s.future.push(project);
              s.project = keepWorkflow(s.past.pop()!, project);
            });
            clearMissingSelection();
          },
          redo: () => {
            const { future, project } = get();
            if (!future.length) return;
            set((s) => {
              s.past.push(project);
              s.project = keepWorkflow(s.future.pop()!, project);
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
          placeWithFix: (candidate, fix) => {
            const { project } = get();
            const placement: Placement =
              "moduleCode" in candidate
                ? newPlacement(project, candidate)
                : ({ ...candidate, id: candidate.id ?? nextId(project, candidate.applianceId) } as AppliancePlacement);
            let after: Project;
            try {
              after = applyFix(withPlacement(project, placement), catalogue, fix.action);
            } catch {
              return { ok: false, id: placement.id, results: [] };
            }
            // A replace fix keeps the id; a remove fix would take it away entirely.
            const placed = findPlacement(after, placement.id);
            // Units the fix added (a sink unit placed with its sink) report their own warnings too.
            const added = after.modules.filter((m) => m.id !== placement.id && !project.modules.some((x) => x.id === m.id));
            const results = placed ? [placed, ...added].flatMap((p) => checkCandidate(after, catalogue, p)) : [];
            const blockedBefore = new Set(runRawChecks(project, catalogue).filter((r) => r.status === "blocked").map(issueKey));
            const newBlocked = runRawChecks(after, catalogue).some((r) => r.status === "blocked" && !blockedBefore.has(issueKey(r)));
            const ok = !!placed && !newBlocked && !hasBlocked(results);
            if (ok) {
              replace(after);
              selectPlacement(placement.id);
              if (isModulePlacement(placed)) rememberFinish(placed);
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
              selectPlacement(placement.id);
            }
            return { ok, id: placement.id, results };
          },
          setSuppliedBy: (id, by) =>
            edit((p) => {
              const a = p.appliances.find((x) => x.id === id);
              if (!a || (a.suppliedBy ?? "makwana") === by) return;
              if (by === "makwana") delete a.suppliedBy;
              else a.suppliedBy = by;
            }),
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
          setDiscount: (pct) => {
            const { project } = get();
            const next = Math.round(Math.min(50, Math.max(0, pct)) * 10) / 10;
            if (next === project.discountPct) return;
            const limit = catalogue.commercial.discountLimitPct;
            const by = actor();
            edit((p) => {
              p.discountPct = next;
              const note = next > limit ? "needs manager approval" : "within salesperson limit";
              p.activity = [...(p.activity ?? []), { at: now(), by, action: "discount_changed", detail: `Discount ${project.discountPct}% → ${next}% · ${note}` }];
            });
          },
          setStatus: (status) =>
            edit((p) => {
              p.status = status;
            }),
          ensureQuote: () => {
            if (get().project.quote) return;
            const seq = get().settings.nextQuoteSeq;
            workflow((p) => createQuote(p, seq, now(), actor()));
            set((s) => {
              s.settings.nextQuoteSeq = seq + 1;
            });
          },
          sendForApproval: () => {
            get().ensureQuote();
            workflow((p) => sendForApproval(p, now(), actor(), approvalItems(runRawChecks(p, catalogue))));
          },
          approve: () => workflow((p) => approve(p, now(), actor())),
          sendBack: (comment) => workflow((p) => sendBack(p, now(), actor(), comment)),
          markShared: (how) => workflow((p) => markShared(p, now(), actor(), how)),
          markPdfDownloaded: () => workflow((p) => markPdfDownloaded(p, now(), actor(), get().settings)),
          setRole: (role) =>
            set((s) => {
              s.settings.role = role;
            }),
          setApprovalMode: (mode) =>
            set((s) => {
              s.settings.approvalMode = mode;
            }),
          setSnapshot: (dataUrl) =>
            set((s) => {
              s.ui.snapshot = dataUrl;
            }),
          setPerformanceMode: (on, auto = false) =>
            set((s) => {
              s.settings.performanceMode = on;
              if (auto) s.settings.performanceAutoSwitched = true;
            }),
          clearRestoreNotice: () =>
            set((s) => {
              s.ui.restoreNotice = null;
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
          setWallHeight: (mode) =>
            set((s) => {
              s.ui.wallHeight = mode;
            }),
          setCustomerView: (on) =>
            set((s) => {
              s.ui.customerView = on;
            }),
          finishFor: (moduleCode) => inheritedFinish(get().project, catalogue, moduleCode, get().ui.recentFinish),
        };
      }),
      {
        name: PERSIST_KEY,
        version: PERSIST_VERSION,
        storage: safeJSONStorage(storage),
        partialize: (s): Saved => ({ project: s.project, settings: s.settings }),
        // A save that fails validation becomes the empty Mehta room (with a toast), never a blank
        // screen. Older saves have no settings: keep the defaults for whatever is missing.
        merge: (persisted, current) => {
          if (persisted === undefined) return current;
          const p = (typeof persisted === "object" && persisted !== null ? persisted : {}) as Partial<Record<keyof Migrated, unknown>>;
          const settings = restoreSettings(p.settings, current.settings);
          if (isUsableProject(p.project, catalogue)) {
            return p.replaced ? { ...current, project: p.project, settings, ui: { ...current.ui, restoreNotice: "old-version" } } : { ...current, project: p.project, settings };
          }
          return { ...current, project: emptyMehta, settings, ui: { ...current.ui, restoreNotice: "unreadable" } };
        },
        // A stored project from another version may not match today's types: start from the seed,
        // but keep the quote counter, so no quote number is ever issued twice. `replaced` tells
        // merge to flag it for the toast (it is not saved: partialize keeps project and settings).
        migrate: (persisted): Migrated => {
          const old = (typeof persisted === "object" && persisted !== null ? persisted : {}) as { settings?: unknown };
          return { project: initial, settings: { ...initialSettings, nextQuoteSeq: restoreSettings(old.settings, initialSettings).nextQuoteSeq }, replaced: true };
        },
        // Anything that throws while restoring (storage, migrate, merge) would leave persist's
        // hydrated flag false and the screens on the skeleton for good: load the empty Mehta room.
        onRehydrateStorage: (state) => (_restored, error) => {
          if (error) state.recoverFromRestoreError();
        },
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

/**
 * The way out of an error screen: clears the saved project (`makwana:project`) and runs Reset demo,
 * so a save that keeps crashing a screen can't come back on reload.
 */
export function startOver(store: ProjectStore = projectStore): void {
  void store.persist.clearStorage();
  store.getState().resetDemo();
}

/** Restores the saved project; if that fails in any way, falls back to the empty Mehta room. */
export function restoreSavedProject(store: ProjectStore = projectStore): Promise<void> {
  try {
    return Promise.resolve(store.persist.rehydrate()).catch(() => store.getState().recoverFromRestoreError());
  } catch {
    store.getState().recoverFromRestoreError();
    return Promise.resolve();
  }
}

/** True once the saved project has been restored, there was none, or restoring failed and fell back. */
export function isRestored(store: ProjectStore = projectStore): boolean {
  return store.persist.hasHydrated() || store.getState().restoreErrored;
}

/** Screens wait for this before reading the project. */
export function useHydrated(store: ProjectStore = projectStore): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const offHydration = store.persist.onFinishHydration(onChange);
      const offStore = store.subscribe(onChange);
      return () => {
        offHydration();
        offStore();
      };
    },
    () => isRestored(store),
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
