// Rules engine. Each rule is a pure (project, catalogue) => CheckResult[] that proposes fixes;
// the engine keeps only the fixes that are proven safe by applying them to a copy.

import { applyFix, withPlacement } from "../fixes";
import type { Catalogue, CheckResult, Fix, ModulePlacement, Placement, Project } from "../types";
import { applianceHostRule, chimneyAboveHobRule, hobUnderWindowRule, sinkNearPlumbingRule } from "./appliance";
import { discountRule } from "./commercial";
import { cornerRule, leftoverGapRule, outsideWallRule, overlapRule } from "./fit";
import { blindSideRule, customSizeRule, finishShutterRule, layerRule } from "./product";
import {
  aboveCeilingRule,
  beamRule,
  blocksDoorRule,
  columnRule,
  coversWindowRule,
  roomClosedRule,
} from "./room";

export type Rule = (project: Project, cat: Catalogue) => CheckResult[];

export const RULES: Rule[] = [
  roomClosedRule,
  overlapRule,
  outsideWallRule,
  coversWindowRule,
  blocksDoorRule,
  aboveCeilingRule,
  beamRule,
  columnRule,
  leftoverGapRule,
  cornerRule,
  finishShutterRule,
  layerRule,
  blindSideRule,
  customSizeRule,
  hobUnderWindowRule,
  chimneyAboveHobRule,
  sinkNearPlumbingRule,
  applianceHostRule,
  discountRule,
];

const MAX_FIXES = 3;

/** Identity of an issue across project versions. */
export function issueKey(r: CheckResult): string {
  return `${r.ruleId}|${[...r.placementIds].sort().join(",")}`;
}

/** All rule results with proposed (unvalidated) fixes. */
export function runRawChecks(project: Project, cat: Catalogue): CheckResult[] {
  return RULES.flatMap((rule) => rule(project, cat));
}

/**
 * A fix is safe if, applied to a copy of the project, its own issue disappears, no new
 * "blocked" result appears, and it doesn't just create another issue of the same kind
 * (sliding a gap along the wall is not a fix). `before` is the project's raw results.
 */
export function isFixSafe(
  project: Project,
  cat: Catalogue,
  issue: CheckResult,
  fix: Fix,
  before: CheckResult[] = runRawChecks(project, cat),
): boolean {
  let after: Project;
  try {
    after = applyFix(project, cat, fix.action);
  } catch {
    return false;
  }
  const existing = new Set(before.filter((r) => r.status !== "pass").map((r) => `${r.status}|${issueKey(r)}`));
  const key = issueKey(issue);
  return runRawChecks(after, cat).every((r) => {
    if (r.status === "pass") return true;
    if (issueKey(r) === key) return false;
    const isNew = !existing.has(`${r.status}|${issueKey(r)}`);
    return !isNew || (r.status !== "blocked" && r.ruleId !== issue.ruleId);
  });
}

/** Only the nearest safe move per wall is kept; other fixes are de-duplicated by action. */
function fixGroup(fix: Fix): string {
  const a = fix.action;
  return a.type === "move" ? `move:${a.placementId}:${a.wallId}` : JSON.stringify(a);
}

function withSafeFixes(project: Project, cat: Catalogue, results: CheckResult[]): CheckResult[] {
  const before = runRawChecks(project, cat);
  return results.map((r) => {
    if (r.status === "pass" || r.fixes.length === 0) return r;
    const kept: Fix[] = [];
    const groups = new Set<string>();
    for (const fix of r.fixes) {
      if (kept.length >= MAX_FIXES) break;
      const g = fixGroup(fix);
      if (groups.has(g)) continue;
      if (isFixSafe(project, cat, r, fix, before)) {
        kept.push(fix);
        groups.add(g);
      }
    }
    return { ...r, fixes: kept };
  });
}

/** Every rule's results for the project, with only safe fixes attached. */
export function runAllChecks(project: Project, cat: Catalogue): CheckResult[] {
  return withSafeFixes(project, cat, runRawChecks(project, cat));
}

/**
 * Results a new or moved placement would cause, without committing it. Fixes are validated
 * against the project as if the candidate were placed, so the UI can offer "place here instead".
 */
export function checkCandidate(project: Project, cat: Catalogue, candidate: Placement): CheckResult[] {
  const augmented = withPlacement(project, candidate);
  const involved = runRawChecks(augmented, cat).filter(
    (r) => r.status !== "pass" && r.placementIds.includes(candidate.id),
  );
  return withSafeFixes(augmented, cat, involved);
}

export const hasBlocked = (results: CheckResult[]) => results.some((r) => r.status === "blocked");

export function summarise(results: CheckResult[]) {
  const count = (s: CheckResult["status"]) => results.filter((r) => r.status === s).length;
  return { blocked: count("blocked"), warning: count("warning"), approval: count("approval") };
}

// ---------------------------------------------------------------------------
// Fast check, for drag previews and keyboard nudges

/** The rules that decide whether a unit can physically sit at a position. */
const PLACEMENT_RULES = [
  outsideWallRule,
  overlapRule,
  coversWindowRule,
  blocksDoorRule,
  aboveCeilingRule,
  beamRule,
  columnRule,
] as const;

export interface FastCheck {
  status: "pass" | "blocked";
  /** One line, e.g. "Tall unit cannot be placed over a window." */
  reason: string | null;
  ruleId: string | null;
}

/** First sentence of a rule message. */
export function firstSentence(message: string): string {
  const i = message.indexOf(". ");
  return i < 0 ? message : message.slice(0, i + 1);
}

/**
 * Placement rules only, with no fix generation: cheap enough to run on every animation frame
 * while dragging. Agrees with checkCandidate on whether the candidate is blocked, as long as
 * the candidate's product choices (layer, shutter, blind side) are valid.
 */
export function checkPlacementFast(project: Project, cat: Catalogue, candidate: Placement): FastCheck {
  const augmented = withPlacement(project, candidate);
  for (const rule of PLACEMENT_RULES) {
    const hit = rule(augmented, cat, { fixes: false }).find(
      (r) => r.status === "blocked" && r.placementIds.includes(candidate.id),
    );
    if (hit) return { status: "blocked", reason: firstSentence(hit.message), ruleId: hit.ruleId };
  }
  return { status: "pass", reason: null, ruleId: null };
}

/**
 * The offset on `wallId` nearest to the module's current offset where the fast check passes,
 * on a 10 mm grid plus the wall end. Null if the unit fits nowhere on that wall.
 */
export function nearestValidOffset(project: Project, cat: Catalogue, placement: ModulePlacement, wallId: string): number | null {
  const wall = project.room.walls.find((w) => w.id === wallId);
  if (!wall || wall.lengthMm < placement.widthMm) return null;
  const max = wall.lengthMm - placement.widthMm;
  const preferred = Math.min(max, Math.max(0, placement.offsetMm));
  const candidates = new Set<number>([max]);
  for (let o = 0; o <= max; o += 10) candidates.add(o);
  const sorted = [...candidates].sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b);
  for (const offsetMm of sorted) {
    if (checkPlacementFast(project, cat, { ...placement, wallId, offsetMm }).status === "pass") return offsetMm;
  }
  return null;
}
