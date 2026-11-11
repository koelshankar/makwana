import { produce } from "immer";
import { FILLER_MAX_MM, getModule } from "./catalogue";
import { defaultBlindSide, isModulePlacement } from "./geometry";
import type { Catalogue, FixAction, ModulePlacement, Placement, Project } from "./types";

/** Adds a placement, or replaces the one with the same id. Pure. */
export function withPlacement(project: Project, placement: Placement): Project {
  return produce(project, (draft) => {
    const list: Placement[] = isModulePlacement(placement) ? draft.modules : draft.appliances;
    const i = list.findIndex((p) => p.id === placement.id);
    if (i >= 0) list.splice(i, 1);
    list.push(placement);
  });
}

/** Removes a placement; removing a host also removes the appliances fitted into it. */
export function withoutPlacement(project: Project, placementId: string): Project {
  return produce(project, (draft) => {
    draft.modules = draft.modules.filter((m) => m.id !== placementId);
    draft.appliances = draft.appliances.filter(
      (a) => a.id !== placementId && !(a.kind === "hosted" && a.hostPlacementId === placementId),
    );
  });
}

function uniqueId(project: Project, base: string): string {
  const taken = new Set([...project.modules, ...project.appliances].map((p) => p.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Applies a fix action to a project, returning a new project. Pure; used by rules and the store. */
export function applyFix(project: Project, cat: Catalogue, action: FixAction): Project {
  switch (action.type) {
    case "remove":
      return withoutPlacement(project, action.placementId);

    case "addFiller": {
      if (action.widthMm < 1 || action.widthMm > FILLER_MAX_MM) throw new Error("Filler width must be 1–100 mm");
      const onRun = project.modules.filter((m) => m.wallId === action.wallId && m.layer === action.layer);
      const neighbour =
        onRun.find((m) => m.offsetMm + m.widthMm === action.offsetMm) ??
        onRun.find((m) => m.offsetMm === action.offsetMm + action.widthMm) ??
        onRun[0] ??
        project.modules[0];
      const filler: ModulePlacement = {
        id: uniqueId(project, `fil-${action.wallId}-${action.layer}-${action.offsetMm}`),
        moduleCode: "FIL",
        wallId: action.wallId,
        layer: action.layer,
        offsetMm: action.offsetMm,
        widthMm: action.widthMm,
        carcassId: neighbour?.carcassId ?? cat.carcasses[0].id,
        finishId: neighbour?.finishId ?? cat.finishes[0].id,
        shutterTypeId: "standard",
        hardware: [],
        isCustomSize: false,
      };
      return withPlacement(project, filler);
    }

    default:
      return produce(project, (draft) => {
        const mod = draft.modules.find((m) => m.id === action.placementId);
        const app = draft.appliances.find((a) => a.id === action.placementId);
        if (!mod && !app) throw new Error(`Unknown placement ${action.placementId}`);

        switch (action.type) {
          case "move":
            if (mod) {
              mod.wallId = action.wallId;
              mod.offsetMm = action.offsetMm;
            } else if (app?.kind === "free") {
              app.wallId = action.wallId;
              app.offsetMm = action.offsetMm;
            } else {
              throw new Error("A fitted appliance moves with its host");
            }
            break;
          case "replace":
          case "replaceAndMove": {
            if (!mod) throw new Error("Only units can be replaced");
            const next = getModule(cat, action.moduleCode);
            mod.moduleCode = next.code;
            mod.widthMm = next.widthMm;
            mod.isCustomSize = false;
            mod.hardware = mod.hardware.filter((h) => next.allowedHardwareIds.includes(h.itemId));
            if (action.type === "replaceAndMove") mod.offsetMm = action.offsetMm;
            if (next.hasBlindSide) {
              mod.blindSide = defaultBlindSide(project.room, mod.wallId, mod.offsetMm, mod.widthMm);
            } else {
              delete mod.blindSide;
            }
            break;
          }
          case "setBlindSide":
            if (!mod || !getModule(cat, mod.moduleCode).hasBlindSide) throw new Error("Only blind corner units have a blind side");
            mod.blindSide = action.blindSide;
            break;
          case "resize": {
            if (!mod) throw new Error("Only units can be resized");
            const spec = getModule(cat, mod.moduleCode);
            mod.widthMm = action.widthMm;
            mod.isCustomSize = spec.family !== "FIL" && action.widthMm !== spec.widthMm;
            break;
          }
          case "setShutterType":
            if (!mod) throw new Error("Only units have shutters");
            mod.shutterTypeId = action.shutterTypeId;
            break;
        }
      });
  }
}
