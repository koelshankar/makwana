// Finish and shutter for a newly placed unit. Pure.

import { getModule } from "./catalogue";
import { validShutterTypes } from "./rules/product";
import type { Catalogue, Layer, ModulePlacement, Project } from "./types";

/** Units in a group share a finish by default: base; wall and loft; tall. */
export type FinishGroup = "base" | "upper" | "tall";

export interface FinishChoice {
  finishId: string;
  shutterTypeId: string;
}

export function finishGroup(layer: Layer): FinishGroup {
  return layer === "base" ? "base" : layer === "tall" ? "tall" : "upper";
}

/** Group of a module: from the catalogue layer, or the layer it was placed in for fillers. */
const groupOf = (cat: Catalogue, p: Pick<ModulePlacement, "moduleCode" | "layer">) => {
  const layer = getModule(cat, p.moduleCode).layer;
  return finishGroup(layer === "any" ? p.layer : layer);
};

/** What a group starts with when there is nothing to inherit. */
export const GROUP_DEFAULTS: Record<FinishGroup, FinishChoice> = {
  base: { finishId: "matte-sage", shutterTypeId: "standard" },
  upper: { finishId: "acrylic-ivory", shutterTypeId: "standard" },
  tall: { finishId: "laminate-charcoal", shutterTypeId: "standard" },
};

/**
 * The finish a new unit inherits: the most recently used choice for its group (`recent`), else
 * the last unit of that group already in the project, else the group's default. The shutter
 * type falls back to the first valid one if the inherited one isn't valid for this module
 * (T600OM always gets Appliance housing).
 */
export function inheritedFinish(
  project: Project,
  cat: Catalogue,
  moduleCode: string,
  recent: Partial<Record<FinishGroup, FinishChoice>> = {},
): FinishChoice {
  const mod = getModule(cat, moduleCode);
  const group = finishGroup(mod.layer === "any" ? "base" : mod.layer);
  const last = [...project.modules].reverse().find((m) => getModule(cat, m.moduleCode).family !== "FIL" && groupOf(cat, m) === group);
  const fallback = cat.finishes.some((f) => f.id === GROUP_DEFAULTS[group].finishId) ? GROUP_DEFAULTS[group] : { finishId: cat.finishes[0].id, shutterTypeId: "standard" };
  const finishId = recent[group]?.finishId ?? last?.finishId ?? fallback.finishId;
  const wanted = recent[group]?.shutterTypeId ?? last?.shutterTypeId ?? fallback.shutterTypeId;
  const valid = validShutterTypes(cat, moduleCode, finishId);
  return { finishId, shutterTypeId: wanted && valid.includes(wanted) ? wanted : valid[0] };
}
