import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";
import { priceProject } from "./pricing";
import {
  approve,
  canShare,
  createQuote,
  designChanged,
  formatDate,
  formatQuoteNumber,
  logActivity,
  markShared,
  quoteModel,
  returnToDraft,
  sendBack,
  sendForApproval,
  whatsappMessage,
} from "./quote";
import { runRawChecks } from "./rules";
import { sampleDesign } from "./seed";
import { formatINR } from "./format";
import type { Project } from "./types";

const T = "2026-10-09T10:30:00.000Z";
const quoted = createQuote(sampleDesign, 147, T, "Rohan Desai");
const raw = (p: Project) => runRawChecks(p, catalogue);

describe("quote identity", () => {
  it("formats MMK-AND-year-sequence", () => {
    expect(formatQuoteNumber(147, 2026)).toBe("MMK-AND-2026-0147");
    expect(formatQuoteNumber(12, 2027, "BDR")).toBe("MMK-BDR-2027-0012");
  });

  it("is assigned once, at version 1 with the rule set version, and logged", () => {
    expect(quoted.quote).toEqual({ number: "MMK-AND-2026-0147", version: 1, ruleSetVersion: "sample-v1", createdAt: T });
    expect(quoted.activity).toEqual([{ at: T, by: "Rohan Desai", action: "quote_created", detail: "Quote MMK-AND-2026-0147 created (Version 1)" }]);
    expect(createQuote(quoted, 148, T, "Rohan Desai")).toBe(quoted);
  });

  it("formats dates without the runtime locale", () => {
    expect(formatDate(T)).toBe("9 Oct 2026");
  });
});

describe("workflow", () => {
  it("draft → pending → approved, each logged", () => {
    const pending = sendForApproval(quoted, T, "Rohan Desai");
    expect(pending.status).toBe("pending_approval");
    const approved = approve(pending, T, "Store Manager");
    expect(approved.status).toBe("approved");
    expect(approved.quote).toMatchObject({ approvedBy: "Store Manager", approvedAt: T });
    expect(approved.activity!.map((a) => a.action)).toEqual(["quote_created", "sent_for_approval", "approved"]);
    // Approve only from pending; send only from draft.
    expect(approve(quoted, T, "x")).toBe(quoted);
    expect(sendForApproval(approved, T, "x")).toBe(approved);
  });

  it("send back needs a comment, returns to draft and keeps the comment until sent again", () => {
    const pending = sendForApproval(quoted, T, "Rohan Desai");
    expect(sendBack(pending, T, "Store Manager", "   ")).toBe(pending);
    const back = sendBack(pending, T, "Store Manager", "Check the sink position");
    expect(back.status).toBe("draft");
    expect(back.quote!.sentBack).toEqual({ by: "Store Manager", at: T, comment: "Check the sink position" });
    expect(back.activity!.at(-1)).toMatchObject({ action: "sent_back", detail: "Sent back: “Check the sink position”" });
    expect(sendForApproval(back, T, "Rohan Desai").quote!.sentBack).toBeUndefined();
  });

  it("a change to an approved quote returns it to draft as a new version; to a pending one, the same version", () => {
    const approved = approve(sendForApproval(quoted, T, "R"), T, "M");
    const v2 = returnToDraft(approved, T, "Rohan Desai");
    expect(v2.status).toBe("draft");
    expect(v2.quote).toMatchObject({ version: 2 });
    expect(v2.quote!.approvedBy).toBeUndefined();
    expect(v2.activity!.slice(-2).map((a) => a.action)).toEqual(["returned_to_draft", "version_created"]);
    const pending = sendForApproval(quoted, T, "R");
    expect(returnToDraft(pending, T, "R").quote!.version).toBe(1);
    expect(returnToDraft(quoted, T, "R")).toBe(quoted);
  });

  it("only design, room or discount changes count", () => {
    expect(designChanged(quoted, { ...quoted, discountPct: 8 })).toBe(true);
    expect(designChanged(quoted, { ...quoted, modules: [...quoted.modules] })).toBe(true);
    expect(designChanged(quoted, { ...quoted, status: "approved", activity: [] })).toBe(false);
  });

  it("watermarks the PDF DRAFT until the quote is approved, and again once an edit returns it to draft (#11)", () => {
    const pending = sendForApproval(quoted, T, "Rohan Desai");
    const approved = approve(pending, T, "Store Manager");
    expect(quoteModel(sampleDesign, catalogue).header.watermark).toBe("DRAFT");
    expect(quoteModel(quoted, catalogue).header.watermark).toBe("DRAFT");
    expect(quoteModel(pending, catalogue).header.watermark).toBe("DRAFT");
    expect(quoteModel(approved, catalogue).header.watermark).toBeUndefined();
    expect(quoteModel(returnToDraft({ ...approved, discountPct: 3 }, T, "Rohan Desai"), catalogue).header.watermark).toBe("DRAFT");
  });

  it("customer, site, project name and kitchen type count as changes: they print on the approved quote (#6)", () => {
    const approved = approve(sendForApproval(quoted, T, "Rohan Desai"), T, "Store Manager");
    for (const patch of [{ customerName: "Someone Else" }, { siteAddress: "Elsewhere" }, { name: "Another kitchen" }, { kitchenType: "open" as const }]) {
      const edited = { ...approved, ...patch };
      expect(designChanged(approved, edited)).toBe(true);
      const back = returnToDraft(edited, T, "Rohan Desai");
      expect(back.status).toBe("draft");
      expect(back.quote!.version).toBe(2);
      expect(back.quote!.approvedBy).toBeUndefined();
    }
    expect(designChanged(approved, { ...approved, customerName: approved.customerName })).toBe(false);
  });

  it("sharing: after approval; or in 'only when flagged' mode when nothing needs approval", () => {
    expect(canShare(quoted, raw(quoted), "always")).toBe(false);
    expect(canShare(quoted, raw(quoted), "flagged")).toBe(true);
    const flagged = { ...quoted, discountPct: 8 };
    expect(canShare(flagged, raw(flagged), "flagged")).toBe(false);
    const approved = approve(sendForApproval(flagged, T, "R"), T, "M");
    expect(canShare(approved, raw(approved), "always")).toBe(true);
    expect(canShare(sampleDesign, raw(sampleDesign), "flagged")).toBe(true); // numbered when shared
    expect(canShare(sampleDesign, raw(sampleDesign), "always")).toBe(false);
  });

  it("logs sharing and keeps entries in order", () => {
    const shared = markShared(quoted, T, "R", "WhatsApp message copied");
    expect(shared.activity!.at(-1)).toMatchObject({ action: "shared", detail: "Version 1 shared with Anil Mehta · WhatsApp message copied" });
    expect(logActivity(shared, T, "R", "discount_changed", "x").activity).toHaveLength(3);
  });
});

describe("quoteModel", () => {
  it("grand total equals priceProject's (and so the Design footer's running total)", () => {
    const m = quoteModel(quoted, catalogue);
    expect(m.totals.grandTotal).toBe(priceProject(quoted, catalogue).grandTotal);
    const discounted = { ...quoted, discountPct: 8 };
    expect(quoteModel(discounted, catalogue).totals.grandTotal).toBe(priceProject(discounted, catalogue).grandTotal);
  });

  it("groups units by row with refs, sizes, finishes and cost tags that add up", () => {
    const m = quoteModel(quoted, catalogue);
    const base = m.groups.find((g) => g.group === "base")!;
    expect(base.lines.map((l) => `${l.ref} ${l.code} ${l.wall}`)).toEqual([
      "B-1 HU900 Wall A",
      "B-2 SU900 Wall A",
      "B-3 FIL Wall A",
      "B-4 BC1000 Wall A",
      "B-5 BD600 Wall B",
      "B-6 BD600 Wall B",
      "B-7 FIL Wall B",
    ]);
    expect(base.lines[0]).toMatchObject({ size: { w: 900, h: 720, d: 560 }, finish: { short: "Sage Green" } });
    for (const g of m.groups) expect(g.lines.reduce((s, l) => s + l.amount, 0)).toBe(g.amount);
    expect(m.groups.find((g) => g.group === "loft")!.note).toBe("Wall B lofts sized below the 2400 mm beam");
    const sum = m.groups.reduce((s, g) => s + g.amount, 0) + m.hardware.total + m.appliances.total;
    expect(sum).toBe(m.totals.subtotal);
  });

  it("lists hardware, appliances (customer's own at ₹0), cut-outs and the countertop", () => {
    const own = { ...quoted, appliances: quoted.appliances.map((a) => (a.id === "a-chimney" ? { ...a, suppliedBy: "customer" as const } : a)) };
    const m = quoteModel(own, catalogue);
    expect(m.hardware.items.find((i) => i.name === "Corner carousel")).toMatchObject({ qty: 1, amount: 14800, sub: "BC1000 blind corner base · Wall A" });
    expect(m.hardware.items.find((i) => i.name === "Soft-close hinges")).toMatchObject({ included: true, amount: 0, sub: "All hinged shutters" });
    expect(m.appliances.items.find((i) => i.name === "90 cm chimney")).toMatchObject({ amount: 0, customerOwn: true });
    expect(m.appliances.items.find((i) => i.name === "Sink cut-out")).toMatchObject({ sub: "750 × 450 mm", amount: 1200 });
    expect(m.appliances.items.at(-1)!.name).toBe("Countertop");
  });

  it("summarises the room, layout and finishes, and the approval items", () => {
    const m = quoteModel({ ...quoted, discountPct: 8 }, catalogue);
    expect(m.summary).toMatchObject({ walls: 8, ceilingMm: 2850, layout: "Units on Wall A and Wall B", carcasses: ["BWP Plywood"] });
    expect(m.summary.finishes.map((f) => f.name)).toEqual(["Matte Lacquer – Sage Green", "Acrylic High Gloss – Ivory", "Laminate – Charcoal"]);
    expect(m.totals).toMatchObject({ discountPct: 8, withinLimit: false, discountLimitPct: 5 });
    expect(m.checks.approvals.map((a) => a.label)).toEqual(["Discount above 5% — needs approval"]);
    expect(m.header).toMatchObject({ quoteNumber: "MMK-AND-2026-0147", version: 1, date: "9 Oct 2026", validUntil: "8 Nov 2026", ruleSetVersion: "sample-v1" });
  });

  it("writes a short WhatsApp message with the name, number, total and validity", () => {
    const text = whatsappMessage(quoteModel(quoted, catalogue), formatINR);
    expect(text).toContain("Dear Anil Mehta");
    expect(text).toContain("MMK-AND-2026-0147");
    expect(text).toContain(formatINR(priceProject(quoted, catalogue).grandTotal));
    expect(text).toContain("valid for 30 days, until 8 Nov 2026");
  });
});
