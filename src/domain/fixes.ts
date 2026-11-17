import { produce } from "immer";
import { FILLER_MAX_MM, getAppliance, getModule } from "./catalogue";
import { inheritedFinish } from "./finish-defaults";
import { defaultBlindSide, isModulePlacement } from "./geometry";
import type { AppliancePlacement, Catalogue, FixAction, HostedAppliancePlacement, ModulePlacement, Placement, Project } from "./types";

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

/**
 * Moves a unit along its wall to `offsetMm`. Units and free appliances in the same layer that it would
 * run into are pushed on, each just far enough. Whether the result fits is for the rules to say.
 */
function pushAlongWall(project: Project, cat: Catalogue, unit: ModulePlacement, offsetMm: number): Project {
  const delta = offsetMm - unit.offsetMm;
  if (delta === 0) return project;
  const start = unit.offsetMm;
  const end = unit.offsetMm + unit.widthMm;
  return produce(project, (draft) => {
    const moving = draft.modules.find((m) => m.id === unit.id)!;
    moving.offsetMm = offsetMm;
    const run = [
      ...draft.modules.filter((m) => m.id !== unit.id && m.wallId === unit.wallId && m.layer === unit.layer).map((p) => ({ p, w: p.widthMm })),
      ...draft.appliances.flatMap((p) =>
        p.kind === "free" && p.wallId === unit.wallId && p.layer === unit.layer ? [{ p, w: getAppliance(cat, p.applianceId).widthMm }] : [],
      ),
    ];
    if (delta > 0) {
      let cursor = offsetMm + unit.widthMm;
      for (const o of run.filter((o) => o.p.offsetMm >= end).sort((a, b) => a.p.offsetMm - b.p.offsetMm)) {
        if (o.p.offsetMm < cursor) o.p.offsetMm = cursor;
        cursor = Math.max(cursor, o.p.offsetMm + o.w);
      }
    } else {
      let cursor = offsetMm;
      for (const o of run.filter((o) => o.p.offsetMm + o.w <= start).sort((a, b) => b.p.offsetMm - a.p.offsetMm)) {
        if (o.p.offsetMm + o.w > cursor) o.p.offsetMm = cursor - o.w;
        cursor = Math.min(cursor, o.p.offsetMm);
      }
    }
  });
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

    case "addCornerFiller": {
      const mod = project.modules.find((m) => m.id === action.placementId);
      if (!mod) throw new Error(`Unknown unit ${action.placementId}`);
      const moved = pushAlongWall(project, cat, mod, action.offsetMm);
      return applyFix(moved, cat, { type: "addFiller", wallId: mod.wallId, layer: mod.layer, offsetMm: action.fillerOffsetMm, widthMm: action.widthMm });
    }

    case "placeHostWithAppliance": {
      const mod = getModule(cat, action.moduleCode);
      if (mod.layer === "any" || !mod.hosts?.includes(action.applianceId)) throw new Error(`${mod.code} can't take a ${action.applianceId}`);
      const host: ModulePlacement = {
        id: uniqueId(project, `m-${mod.code.toLowerCase()}`),
        moduleCode: mod.code,
        wallId: action.wallId,
        layer: mod.layer,
        offsetMm: action.offsetMm,
        widthMm: mod.widthMm,
        carcassId: cat.carcasses[0].id,
        ...inheritedFinish(project, cat, mod.code),
        hardware: [],
        isCustomSize: false,
      };
      if (mod.hasBlindSide) host.blindSide = defaultBlindSide(project.room, host.wallId, host.offsetMm, host.widthMm);
      const loose = action.placementId ? project.appliances.find((a) => a.id === action.placementId) : undefined;
      const fitted: HostedAppliancePlacement = {
        kind: "hosted",
        id: loose?.id ?? uniqueId(project, `a-${action.applianceId}`),
        applianceId: action.applianceId,
        hostPlacementId: host.id,
        ...(loose?.suppliedBy ? { suppliedBy: loose.suppliedBy } : {}),
      };
      return withPlacement(withPlacement(project, host), fitted);
    }

    case "attach": {
      const a = project.appliances.find((x) => x.id === action.placementId);
      const host = project.modules.find((m) => m.id === action.hostPlacementId);
      if (!a || !host) throw new Error("Unknown appliance or host");
      if (!getModule(cat, host.moduleCode).hosts?.includes(a.applianceId)) {
        throw new Error(`${host.moduleCode} can't take a ${getAppliance(cat, a.applianceId).name}`);
      }
      const fitted: AppliancePlacement = {
        kind: "hosted",
        id: a.id,
        applianceId: a.applianceId,
        hostPlacementId: host.id,
        ...(a.suppliedBy ? { suppliedBy: a.suppliedBy } : {}),
      };
      return withPlacement(project, fitted);
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
