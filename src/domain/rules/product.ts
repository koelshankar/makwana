import { getFinish, getModule, getShutterType } from "../catalogue";
import { defaultBlindSide } from "../geometry";
import type { Catalogue, CheckResult, Project } from "../types";
import { mm, pass } from "./context";

/** The shutter types a module/finish pair may use, in order of preference. */
export function validShutterTypes(cat: Catalogue, moduleCode: string, finishId: string): string[] {
  const mod = getModule(cat, moduleCode);
  if (mod.code === "T600OM") return ["appliance-housing"];
  return cat.shutterTypes
    .map((s) => s.id)
    .filter((id) => id !== "appliance-housing")
    .filter((id) => !(id === "glass" && mod.layer !== "wall"))
    .filter((id) => !(id === "handleless" && finishId === "acrylic-ivory"));
}

/** Rule 10: invalid finish / shutter combinations. */
export function finishShutterRule(project: Project, cat: Catalogue): CheckResult[] {
  const results: CheckResult[] = [];
  for (const p of project.modules) {
    const mod = getModule(cat, p.moduleCode);
    if (mod.family === "FIL") continue;
    const valid = validShutterTypes(cat, p.moduleCode, p.finishId);
    if (valid.includes(p.shutterTypeId)) continue;

    const shutter = getShutterType(cat, p.shutterTypeId);
    const finish = getFinish(cat, p.finishId);
    let message: string;
    if (mod.code === "T600OM") message = `${mod.code} must use Appliance housing shutters.`;
    else if (p.shutterTypeId === "appliance-housing") message = `Appliance housing shutters are only for T600OM, not ${mod.code}.`;
    else if (p.shutterTypeId === "glass") message = `Glass frame shutters are only available on wall units, not ${mod.code}.`;
    else message = `${finish.name} cannot be made with a ${shutter.name.toLowerCase()} on ${mod.code}.`;

    const best = valid[0];
    results.push({
      ruleId: "finish-shutter",
      group: "product",
      status: "blocked",
      placementIds: [p.id],
      message,
      fixes: best
        ? [
            {
              label: `Switch to ${getShutterType(cat, best).name}`,
              action: { type: "setShutterType", placementId: p.id, shutterTypeId: best },
            },
          ]
        : [],
    });
  }
  return results.length ? results : [pass("finish-shutter", "product", "Finish and shutter choices are valid")];
}

/** A module must sit in the layer it was designed for (fillers fit any layer). */
export function layerRule(project: Project, cat: Catalogue): CheckResult[] {
  const results: CheckResult[] = project.modules
    .filter((p) => {
      const mod = getModule(cat, p.moduleCode);
      return mod.layer !== "any" && mod.layer !== p.layer;
    })
    .map((p) => ({
      ruleId: "layer",
      group: "product" as const,
      status: "blocked" as const,
      placementIds: [p.id],
      message: `${p.moduleCode} is a ${getModule(cat, p.moduleCode).layer} unit and can't go in the ${p.layer} row.`,
      fixes: [{ label: `Remove ${p.moduleCode}`, action: { type: "remove" as const, placementId: p.id } }],
    }));
  return results.length ? results : [pass("layer", "product", "Every unit is in the right row")];
}

/** Rule 14: custom sizes need manager approval. */
export function customSizeRule(project: Project, cat: Catalogue): CheckResult[] {
  const results: CheckResult[] = project.modules
    .filter((p) => p.isCustomSize)
    .map((p) => ({
      ruleId: "custom-size",
      group: "product" as const,
      status: "approval" as const,
      placementIds: [p.id],
      message: `${p.moduleCode} is made to a custom width of ${mm(p.widthMm)} mm (catalogue ${mm(getModule(cat, p.moduleCode).widthMm)} mm) and needs manager approval.`,
      fixes: [],
    }));
  return results.length ? results : [pass("custom-size", "product", "All units are catalogue sizes")];
}

/** Blind corner units must say which side is blind. */
export function blindSideRule(project: Project, cat: Catalogue): CheckResult[] {
  const results: CheckResult[] = project.modules
    .filter((p) => getModule(cat, p.moduleCode).hasBlindSide && !p.blindSide)
    .map((p) => {
      const side = defaultBlindSide(project.room, p.wallId, p.offsetMm, p.widthMm);
      return {
        ruleId: "blind-side",
        group: "product" as const,
        status: "blocked" as const,
        placementIds: [p.id],
        message: `${p.moduleCode} needs a blind side (left or right).`,
        fixes: [{ label: `Make the blind side ${side}`, action: { type: "setBlindSide" as const, placementId: p.id, blindSide: side } }],
      };
    });
  return results.length ? results : [pass("blind-side", "product", "Blind corner units are set up")];
}
