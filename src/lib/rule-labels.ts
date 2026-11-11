// Display labels for rule results.

import type { CheckGroup, CheckResult } from "@/domain/types";

const GROUP_LABELS: Record<CheckGroup, string> = {
  room: "Room rule",
  fit: "Fit rule",
  product: "Product rule",
  appliance: "Appliance rule",
  commercial: "Commercial rule",
};

const RULE_TOPICS: Record<string, string> = {
  "room-closed": "Walls",
  "covers-window": "Windows",
  "blocks-door": "Doors",
  "above-ceiling": "Ceiling",
  beam: "Beams",
  column: "Columns",
  overlap: "Overlap",
  "outside-wall": "Wall length",
  "leftover-gap": "Gaps",
  corner: "Corners",
  "finish-shutter": "Finishes",
  layer: "Rows",
  "blind-side": "Corners",
  "custom-size": "Sizes",
  "hob-under-window": "Hob",
  "chimney-above-hob": "Chimney",
  "sink-near-plumbing": "Sink",
  "appliance-host": "Appliances",
  discount: "Discount",
};

/** e.g. "Room rule · Windows". */
export function ruleLabel(r: Pick<CheckResult, "group" | "ruleId">): string {
  const topic = RULE_TOPICS[r.ruleId];
  return topic ? `${GROUP_LABELS[r.group]} · ${topic}` : GROUP_LABELS[r.group];
}

/** Splits a rule message into a bold title (first sentence) and the explanation. */
export function splitMessage(message: string): { title: string; detail: string } {
  const i = message.indexOf(". ");
  return i < 0 ? { title: message, detail: "" } : { title: message.slice(0, i + 1), detail: message.slice(i + 2) };
}

export const STATUS_LABELS: Record<CheckResult["status"], string> = {
  pass: "Passed",
  warning: "Warning",
  blocked: "Blocked",
  approval: "Needs approval",
};
