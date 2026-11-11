import type { Catalogue, CheckResult, Project } from "../types";
import { pass } from "./context";

/** Rule 15: discount above the salesperson limit needs approval. */
export function discountRule(project: Project, cat: Catalogue): CheckResult[] {
  const limit = cat.commercial.discountLimitPct;
  if (project.discountPct <= limit) {
    return [pass("discount", "commercial", `Discount within the ${limit}% salesperson limit`)];
  }
  return [
    {
      ruleId: "discount",
      group: "commercial",
      status: "approval",
      placementIds: [],
      message: `A ${project.discountPct}% discount is above the ${limit}% salesperson limit and needs manager approval.`,
      fixes: [],
    },
  ];
}
