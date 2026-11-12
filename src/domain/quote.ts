// Quote identity, the approval workflow and the quote document model. Pure: every helper takes
// the time and the person explicitly and returns a new project.

import { getAppliance, getCarcass, getFinish, getHardware, getModule } from "./catalogue";
import { findPlacement, isModulePlacement } from "./geometry";
import { PRICE_GROUP_LABELS, priceProject, type PriceLine } from "./pricing";
import { runRawChecks } from "./rules";
import type { ActivityAction, ActivityEntry, Catalogue, CheckResult, Layer, Project } from "./types";

export const RULE_SET_VERSION = "sample-v1";
export const QUOTE_PREFIX = "MMK";
export const STORE_CODE = "AND";
export const QUOTE_VALIDITY_DAYS = 30;
/** Who approves in the demo. */
export const MANAGER_NAME = "Store Manager";

export type ApprovalMode = "always" | "flagged";

/** "MMK-AND-2026-0147". */
export function formatQuoteNumber(sequence: number, year: number, storeCode = STORE_CODE): string {
  return `${QUOTE_PREFIX}-${storeCode}-${year}-${String(sequence).padStart(4, "0")}`;
}

/** "9 Oct 2026", independent of the runtime locale. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Activity log

export function logActivity(project: Project, at: string, by: string, action: ActivityAction, detail: string): Project {
  const entry: ActivityEntry = { at, by, action, detail };
  return { ...project, activity: [...(project.activity ?? []), entry] };
}

// ---------------------------------------------------------------------------
// Workflow: draft → pending_approval → approved

/** Gives the project a quote number and version 1, once. */
export function createQuote(project: Project, sequence: number, at: string, by: string): Project {
  if (project.quote) return project;
  const number = formatQuoteNumber(sequence, new Date(at).getFullYear());
  const withQuote: Project = { ...project, quote: { number, version: 1, ruleSetVersion: RULE_SET_VERSION, createdAt: at } };
  return logActivity(withQuote, at, by, "quote_created", `Quote ${number} created (Version 1)`);
}

/** True when the design, the room or the discount differ: what an approval was given for. */
export function designChanged(before: Project, after: Project): boolean {
  return before.room !== after.room || before.modules !== after.modules || before.appliances !== after.appliances || before.discountPct !== after.discountPct;
}

/**
 * After a design change to a quote that is pending or approved: back to draft, and a new
 * version if it had been approved. Returns the project unchanged if it was already a draft.
 */
export function returnToDraft(project: Project, at: string, by: string): Project {
  if (project.status === "draft" || !project.quote) return project.status === "draft" ? project : { ...project, status: "draft" };
  const wasApproved = project.status === "approved";
  const version = project.quote.version + (wasApproved ? 1 : 0);
  const quote = { ...project.quote, version };
  delete quote.approvedAt;
  delete quote.approvedBy;
  let next: Project = { ...project, status: "draft", quote };
  next = logActivity(next, at, by, "returned_to_draft", `Changed while ${wasApproved ? "approved" : "pending approval"}: returned to draft`);
  if (wasApproved) next = logActivity(next, at, by, "version_created", `Version ${version} created`);
  return next;
}

export function sendForApproval(project: Project, at: string, by: string, approvals: CheckResult[] = []): Project {
  if (!project.quote || project.status !== "draft") return project;
  const quote = { ...project.quote };
  delete quote.sentBack;
  const why = approvals.length ? ` · ${approvals.map((r) => approvalLabel(r)).join("; ")}` : "";
  return logActivity({ ...project, status: "pending_approval", quote }, at, by, "sent_for_approval", `Version ${quote.version} sent for approval${why}`);
}

export function approve(project: Project, at: string, by: string): Project {
  if (!project.quote || project.status !== "pending_approval") return project;
  const quote = { ...project.quote, approvedBy: by, approvedAt: at };
  return logActivity({ ...project, status: "approved", quote }, at, by, "approved", `Version ${quote.version} approved`);
}

export function sendBack(project: Project, at: string, by: string, comment: string): Project {
  const text = comment.trim();
  if (!project.quote || project.status !== "pending_approval" || !text) return project;
  const quote = { ...project.quote, sentBack: { by, at, comment: text } };
  return logActivity({ ...project, status: "draft", quote }, at, by, "sent_back", `Sent back: “${text}”`);
}

export function markShared(project: Project, at: string, by: string, how: string): Project {
  if (!project.quote) return project;
  return logActivity(project, at, by, "shared", `Version ${project.quote.version} shared with ${project.customerName || "the customer"} · ${how}`);
}

/** The approval-status rule results (discount above the limit, custom sizes). */
export function approvalItems(results: CheckResult[]): CheckResult[] {
  return results.filter((r) => r.status === "approval");
}

/** Short label for an approval item, e.g. "Discount above 5% — needs approval". */
export function approvalLabel(r: CheckResult, cat?: Catalogue): string {
  if (r.ruleId === "discount") return `Discount above ${cat?.commercial.discountLimitPct ?? 5}% — needs approval`;
  if (r.ruleId === "custom-size") return `${r.message.split(" ")[0]} custom width — needs approval`;
  return r.message;
}

/**
 * Whether the quote may go to the customer: once approved; or, in "only when flagged" mode, a
 * draft with nothing that needs approval.
 */
export function canShare(project: Project, results: CheckResult[], mode: ApprovalMode): boolean {
  if (!project.quote || results.some((r) => r.status === "blocked")) return false;
  if (project.status === "approved") return true;
  return mode === "flagged" && approvalItems(results).length === 0;
}

// ---------------------------------------------------------------------------
// Quote document model: one source for the Quote screen and the printed PDF.

export interface QuoteUnitLine {
  ref: string;
  placementId: string;
  wall: string;
  code: string;
  description: string;
  size: { w: number; h: number; d: number };
  finish: { name: string; short: string; hex: string };
  carcassSqft: number;
  carcassCost: number;
  shutterSqft: number;
  shutterCost: number;
  amount: number;
}

export interface QuoteGroup {
  group: Layer;
  label: string;
  count: number;
  carcassSqft: number;
  carcassCost: number;
  shutterSqft: number;
  shutterCost: number;
  amount: number;
  note?: string;
  lines: QuoteUnitLine[];
}

export interface QuoteItem {
  name: string;
  sub: string;
  qty: number;
  amount: number;
  included?: boolean;
  customerOwn?: boolean;
}

export interface QuoteModel {
  header: {
    quoteNumber: string;
    version: number;
    status: Project["status"];
    date: string;
    validUntil: string;
    validityDays: number;
    projectName: string;
    customerName: string;
    siteAddress: string;
    preparedBy: string;
    ruleSetVersion: string;
    approvedBy?: string;
    approvedAt?: string;
  };
  summary: {
    walls: number;
    ceilingMm: number;
    layout: string;
    carcasses: string[];
    finishes: { name: string; hex: string }[];
    modules: number;
    appliances: number;
  };
  groups: QuoteGroup[];
  hardware: { total: number; items: QuoteItem[] };
  appliances: { total: number; items: QuoteItem[] };
  totals: {
    subtotal: number;
    discountPct: number;
    discount: number;
    discountLimitPct: number;
    withinLimit: boolean;
    taxableValue: number;
    gstPct: number;
    gst: number;
    grandTotal: number;
  };
  checks: { blocked: number; warnings: number; approvals: { message: string; label: string }[]; allPassed: boolean };
}

const REF_PREFIX: Record<Layer, string> = { base: "B", wall: "W", loft: "L", tall: "T" };
const shortFinish = (name: string) => name.split("–").pop()!.trim();
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Where a unit or appliance is, for sub-lines: "HU900 · Wall A". */
function whereIs(project: Project, cat: Catalogue, placementId: string | undefined): string {
  const p = placementId ? findPlacement(project, placementId) : undefined;
  if (!p) return "";
  if (isModulePlacement(p)) return `${p.moduleCode} ${getModule(cat, p.moduleCode).name.toLowerCase()} · Wall ${p.wallId}`;
  if (p.kind === "free") return `Wall ${p.wallId}`;
  const host = project.modules.find((m) => m.id === p.hostPlacementId);
  return host ? `Fitted in ${host.moduleCode} · Wall ${host.wallId}` : "";
}

const INCLUDED_SUBS: Record<string, string> = {
  "hinge-soft-close": "All hinged shutters",
  "handle-profile": "All shutters and drawers",
  "drawer-standard": "Drawer units",
};

export function quoteModel(project: Project, cat: Catalogue, results: CheckResult[] = runRawChecks(project, cat)): QuoteModel {
  const pricing = priceProject(project, cat);
  const created = project.quote?.createdAt ?? new Date().toISOString();

  // Units, grouped by row, ordered by wall then position, numbered B-1, B-2…
  const byGroup = (["base", "wall", "loft", "tall"] as Layer[]).map((group): QuoteGroup => {
    const lines = pricing.lines
      .filter((l): l is PriceLine & { placementId: string } => l.group === group && !!l.placementId)
      .map((l) => ({ l, p: project.modules.find((m) => m.id === l.placementId)! }))
      .sort((a, b) => a.p.wallId.localeCompare(b.p.wallId) || a.p.offsetMm - b.p.offsetMm)
      .map(({ l, p }, i): QuoteUnitLine => {
        const finish = getFinish(cat, p.finishId);
        return {
          ref: `${REF_PREFIX[group]}-${i + 1}`,
          placementId: p.id,
          wall: `Wall ${p.wallId}`,
          code: p.moduleCode,
          description: l.description,
          size: { w: l.widthMm ?? p.widthMm, h: l.heightMm ?? 0, d: l.depthMm ?? 0 },
          finish: { name: finish.name, short: shortFinish(finish.name), hex: finish.hex },
          carcassSqft: l.carcassSqft,
          carcassCost: l.carcassCost,
          shutterSqft: l.shutterSqft,
          shutterCost: l.shutterCost,
          amount: l.amount,
        };
      });
    const total = pricing.groups.find((g) => g.group === group)!;
    const shortLofts = group === "loft" ? project.modules.filter((m) => m.layer === "loft" && getModule(cat, m.moduleCode).family === "LS") : [];
    const beamWalls = [...new Set(shortLofts.map((m) => m.wallId))].filter((w) => project.room.features.some((f) => f.kind === "beam" && f.wallId === w));
    const beam = project.room.features.find((f) => f.kind === "beam" && beamWalls.includes(f.wallId));
    return {
      group,
      label: PRICE_GROUP_LABELS[group],
      count: lines.length,
      carcassSqft: total.carcassSqft,
      carcassCost: total.carcassCost,
      shutterSqft: total.shutterSqft,
      shutterCost: total.shutterCost,
      amount: total.amount,
      note: beam && beam.kind === "beam" ? `${list(beamWalls.map((w) => `Wall ${w}`))} lofts sized below the ${beam.bottomMm} mm beam` : undefined,
      lines,
    };
  });

  const hardwareLines = pricing.lines.filter((l) => l.group === "hardware");
  const hardware: QuoteItem[] = hardwareLines.map((l) => ({
    name: getHardware(cat, l.code).name,
    sub: l.placementId ? whereIs(project, cat, l.placementId) : (INCLUDED_SUBS[l.code] ?? "All units"),
    qty: l.qty,
    amount: l.amount,
    included: l.included,
  }));

  const appliances: QuoteItem[] = pricing.lines
    .filter((l) => l.group === "appliances")
    .map((l): QuoteItem => {
      if (l.code === "countertop") return { name: "Countertop", sub: `${cat.countertop.name} · ${l.description.split("· ")[1] ?? ""}`, qty: 1, amount: l.amount };
      if (l.code.endsWith("-cutout")) {
        const spec = getAppliance(cat, l.code.replace(/-cutout$/, ""));
        return { name: `${spec.id === "hob" ? "Hob" : "Sink"} cut-out`, sub: `${spec.cutOut!.widthMm} × ${spec.cutOut!.depthMm} mm`, qty: 1, amount: l.amount };
      }
      const a = project.appliances.find((x) => x.id === l.placementId);
      const own = a?.suppliedBy === "customer";
      return { name: getAppliance(cat, l.code).name, sub: own ? `Customer's own · ${whereIs(project, cat, l.placementId)}` : whereIs(project, cat, l.placementId), qty: 1, amount: l.amount, customerOwn: own };
    });

  const usedWalls = [...new Set([...project.modules.map((m) => m.wallId), ...project.appliances.flatMap((a) => (a.kind === "free" ? [a.wallId] : []))])].sort();
  const finishIds = [...new Set(project.modules.filter((m) => getModule(cat, m.moduleCode).family !== "FIL").map((m) => m.finishId))];
  const limit = cat.commercial.discountLimitPct;
  const approvals = approvalItems(results);

  return {
    header: {
      quoteNumber: project.quote?.number ?? "Not yet assigned",
      version: project.quote?.version ?? 1,
      status: project.status,
      date: formatDate(created),
      validUntil: formatDate(addDays(created, QUOTE_VALIDITY_DAYS)),
      validityDays: QUOTE_VALIDITY_DAYS,
      projectName: project.name,
      customerName: project.customerName,
      siteAddress: project.siteAddress,
      preparedBy: project.preparedBy,
      ruleSetVersion: project.quote?.ruleSetVersion ?? RULE_SET_VERSION,
      approvedBy: project.quote?.approvedBy,
      approvedAt: project.quote?.approvedAt ? formatDate(project.quote.approvedAt) : undefined,
    },
    summary: {
      walls: project.room.walls.length,
      ceilingMm: project.room.ceilingHeightMm,
      layout: usedWalls.length ? `Units on ${list(usedWalls.map((w) => `Wall ${w}`))}` : "No units yet",
      carcasses: [...new Set(project.modules.map((m) => getCarcass(cat, m.carcassId).name))],
      finishes: finishIds.map((id) => getFinish(cat, id)).map((f) => ({ name: f.name, hex: f.hex })),
      modules: project.modules.filter((m) => getModule(cat, m.moduleCode).family !== "FIL").length,
      appliances: project.appliances.length,
    },
    groups: byGroup,
    hardware: { total: pricing.groups.find((g) => g.group === "hardware")!.amount, items: hardware },
    appliances: { total: pricing.groups.find((g) => g.group === "appliances")!.amount, items: appliances },
    totals: {
      subtotal: pricing.subtotal,
      discountPct: pricing.discountPct,
      discount: pricing.discount,
      discountLimitPct: limit,
      withinLimit: pricing.discountPct <= limit,
      taxableValue: pricing.taxableValue,
      gstPct: pricing.gstPct,
      gst: pricing.gst,
      grandTotal: pricing.grandTotal,
    },
    checks: {
      blocked: results.filter((r) => r.status === "blocked").length,
      warnings: results.filter((r) => r.status === "warning").length,
      approvals: approvals.map((r) => ({ message: r.message, label: approvalLabel(r, cat) })),
      allPassed: results.every((r) => r.status === "pass"),
    },
  };
}

/** The WhatsApp message the salesperson can paste for the customer. */
export function whatsappMessage(m: QuoteModel, formatMoney: (n: number) => string): string {
  const name = m.header.customerName || "there";
  return [
    `Dear ${name},`,
    ``,
    `Thank you for visiting Makwana Modular Kulture. Your kitchen quote ${m.header.quoteNumber} (Version ${m.header.version}) for ${m.header.projectName} comes to ${formatMoney(m.totals.grandTotal)} including GST.`,
    ``,
    `The quote is valid for ${m.header.validityDays} days, until ${m.header.validUntil}. I have attached the PDF; please let me know if you would like any changes.`,
    ``,
    `Warm regards,`,
    `${m.header.preparedBy}, Makwana Experience Centre, Andheri`,
  ].join("\n");
}
