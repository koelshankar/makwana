// Checks a project restored from storage before the app uses it. A save from an older build, a
// hand-edited one or a half-written one must never reach the screens: anything that fails here
// is replaced by the empty Mehta room.

import { priceProject } from "./pricing";
import { quoteModel } from "./quote";
import { runRawChecks } from "./rules";
import type { Catalogue, Project } from "./types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const oneOf = <T extends string>(v: unknown, xs: readonly T[]): v is T => xs.includes(v as T);
const optional = (v: unknown, test: (x: unknown) => boolean) => v === undefined || test(v);

const HEADINGS = ["N", "E", "S", "W"] as const;
const LAYERS = ["base", "wall", "loft", "tall"] as const;
const STATUSES = ["draft", "pending_approval", "approved"] as const;
const KITCHEN_TYPES = ["closed", "open", "semi-open"] as const;
const SUPPLIERS = ["makwana", "customer"] as const;

function validFeature(f: unknown, wallIds: Set<string>): boolean {
  if (!isObj(f) || !isStr(f.id)) return false;
  const onWall = isStr(f.wallId) && wallIds.has(f.wallId);
  switch (f.kind) {
    case "window":
      return onWall && isInt(f.offsetMm) && isInt(f.widthMm) && isInt(f.sillMm) && isInt(f.topMm);
    case "door":
      return onWall && isInt(f.offsetMm) && isInt(f.widthMm) && isInt(f.heightMm);
    case "plumbing":
      return onWall && isInt(f.offsetMm);
    case "beam":
      return onWall && isInt(f.bottomMm) && isInt(f.depthMm);
    case "column":
      return isNum(f.x) && isNum(f.y) && isInt(f.widthMm) && isInt(f.depthMm);
    case "ductBox":
      return isStr(f.label) && optional(f.fromWallId, isStr) && optional(f.toWallId, isStr);
    default:
      return false;
  }
}

/** Shape and references: every id points at something that exists in the room or catalogue. */
function validShape(v: unknown, cat: Catalogue): v is Project {
  if (!isObj(v)) return false;
  if (![v.id, v.name, v.customerName, v.siteAddress, v.preparedBy].every(isStr)) return false;
  if (!oneOf(v.kitchenType, KITCHEN_TYPES) || !oneOf(v.status, STATUSES)) return false;
  if (!isNum(v.discountPct) || v.discountPct < 0 || v.discountPct > 50) return false;

  const room = v.room;
  if (!isObj(room) || !isInt(room.ceilingHeightMm) || room.ceilingHeightMm <= 0) return false;
  if (!Array.isArray(room.walls) || !Array.isArray(room.features)) return false;
  const wallIds = new Set<string>();
  for (const w of room.walls) {
    if (!isObj(w) || !isStr(w.id) || wallIds.has(w.id) || !isInt(w.lengthMm) || w.lengthMm <= 0 || !oneOf(w.heading, HEADINGS)) return false;
    if (!optional(w.label, isStr)) return false;
    wallIds.add(w.id);
  }
  if (!room.features.every((f) => validFeature(f, wallIds))) return false;

  if (!Array.isArray(v.modules) || !Array.isArray(v.appliances)) return false;
  const ids = new Set<string>();
  for (const m of v.modules) {
    if (!isObj(m) || !isStr(m.id) || ids.has(m.id)) return false;
    if (!isStr(m.wallId) || !wallIds.has(m.wallId) || !oneOf(m.layer, LAYERS)) return false;
    if (!isInt(m.offsetMm) || !isInt(m.widthMm) || m.widthMm <= 0 || typeof m.isCustomSize !== "boolean") return false;
    if (!cat.modules.some((x) => x.code === m.moduleCode)) return false;
    if (!cat.carcasses.some((x) => x.id === m.carcassId) || !cat.finishes.some((x) => x.id === m.finishId)) return false;
    if (!cat.shutterTypes.some((x) => x.id === m.shutterTypeId)) return false;
    if (!Array.isArray(m.hardware) || !m.hardware.every((h) => isObj(h) && cat.hardware.some((x) => x.id === h.itemId) && isInt(h.qty))) return false;
    if (!optional(m.blindSide, (s) => s === "left" || s === "right")) return false;
    ids.add(m.id);
  }
  for (const a of v.appliances) {
    if (!isObj(a) || !isStr(a.id) || ids.has(a.id)) return false;
    if (!cat.appliances.some((x) => x.id === a.applianceId) || !optional(a.suppliedBy, (s) => oneOf(s, SUPPLIERS))) return false;
    if (a.kind === "hosted") {
      if (!isStr(a.hostPlacementId) || !v.modules.some((m) => (m as Obj).id === a.hostPlacementId)) return false;
    } else if (a.kind === "free") {
      if (!isStr(a.wallId) || !wallIds.has(a.wallId) || !oneOf(a.layer, LAYERS) || !isInt(a.offsetMm)) return false;
    } else return false;
    ids.add(a.id);
  }

  if (v.quote !== undefined) {
    const q = v.quote;
    if (!isObj(q) || !isStr(q.number) || !isInt(q.version) || q.version < 1 || !isStr(q.ruleSetVersion) || !isStr(q.createdAt)) return false;
  }
  if (v.activity !== undefined) {
    if (!Array.isArray(v.activity) || !v.activity.every((e) => isObj(e) && isStr(e.at) && isStr(e.by) && isStr(e.action) && isStr(e.detail))) return false;
  }
  return true;
}

/**
 * True when a restored value is a project every screen can draw: the right shape, references
 * that resolve, and the rules, pricing and quote all run on it without throwing.
 */
export function isUsableProject(v: unknown, cat: Catalogue): v is Project {
  if (!validShape(v, cat)) return false;
  try {
    const results = runRawChecks(v, cat);
    priceProject(v, cat);
    quoteModel(v, cat, results);
    return true;
  } catch {
    return false;
  }
}
