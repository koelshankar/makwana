// Test-only helpers shared by the domain test suites.

import { expect } from "vitest";
import { catalogue } from "./catalogue";
import { applyFix } from "./fixes";
import { issueKey, runRawChecks } from "./rules";
import type { CheckResult, Layer, ModulePlacement, Project } from "./types";

export function unit(
  id: string,
  moduleCode: string,
  wallId: string,
  offsetMm: number,
  widthMm: number,
  layer: Layer = "base",
  overrides: Partial<ModulePlacement> = {},
): ModulePlacement {
  return {
    id,
    moduleCode,
    wallId,
    layer,
    offsetMm,
    widthMm,
    carcassId: "bwp",
    finishId: "matte-sage",
    shutterTypeId: "standard",
    hardware: [],
    isCustomSize: false,
    ...overrides,
  };
}

/**
 * Every fix on every result, applied to `project`, must remove its own issue and must not
 * create a blocked result that wasn't there before.
 */
export function expectFixesWork(project: Project, results: CheckResult[]) {
  const blockedBefore = new Set(
    runRawChecks(project, catalogue).filter((r) => r.status === "blocked").map(issueKey),
  );
  for (const r of results) {
    for (const fix of r.fixes) {
      const after = runRawChecks(applyFix(project, catalogue, fix.action), catalogue);
      const label = `${r.ruleId}: ${fix.label}`;
      expect(after.some((x) => x.status !== "pass" && issueKey(x) === issueKey(r)), `${label} leaves its issue`).toBe(false);
      const newBlocked = after.filter((x) => x.status === "blocked" && !blockedBefore.has(issueKey(x)));
      expect(newBlocked.map((x) => x.message), `${label} creates new blocked results`).toEqual([]);
    }
  }
}
