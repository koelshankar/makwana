import { getAppliance, getCarcass, getFinish, getHardware, getModule, getShutterType } from "../catalogue";
import { countertopOutline, rectArea } from "../geometry";
import type { AppliancePlacement, Catalogue, Layer, ModulePlacement, Project } from "../types";

export const MM2_PER_SQFT = 92903.04; // 304.8²

const round2 = (n: number) => Math.round(n * 100) / 100;
export const sqft = (mm2: number) => round2(mm2 / MM2_PER_SQFT);

export type PriceGroup = Layer | "hardware" | "appliances";

export const PRICE_GROUP_LABELS: Record<PriceGroup, string> = {
  base: "Base",
  wall: "Wall",
  loft: "Loft",
  tall: "Tall",
  hardware: "Hardware & Accessories",
  appliances: "Appliances & Countertop",
};

export interface PriceLine {
  group: PriceGroup;
  placementId?: string;
  code: string;
  description: string;
  wall?: string;
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  finish?: string;
  qty: number;
  included: boolean;
  carcassSqft: number;
  carcassCost: number;
  shutterSqft: number;
  shutterCost: number;
  amount: number;
}

export interface GroupTotal {
  group: PriceGroup;
  label: string;
  count: number;
  carcassSqft: number;
  carcassCost: number;
  shutterSqft: number;
  shutterCost: number;
  amount: number;
}

export interface Pricing {
  lines: PriceLine[];
  groups: GroupTotal[];
  subtotal: number;
  discountPct: number;
  discount: number;
  taxableValue: number;
  gstPct: number;
  gst: number;
  grandTotal: number;
}

/** Shutter/filler height by layer for fillers, which take the height of the run. */
const FILLER_HEIGHT: Record<Layer, number> = { base: 720, wall: 720, loft: 400, tall: 2100 };
const FILLER_DEPTH_MM = 20;

const blank = { carcassSqft: 0, carcassCost: 0, shutterSqft: 0, shutterCost: 0 };

/** Carcass and shutter price of one unit (fillers: shutter only). Hardware add-ons are separate lines. */
export function moduleLine(p: ModulePlacement, cat: Catalogue): PriceLine {
  const mod = getModule(cat, p.moduleCode);
  const finish = getFinish(cat, p.finishId);
  const w = p.widthMm;
  const common = {
    group: p.layer,
    placementId: p.id,
    code: mod.code,
    wall: p.wallId,
    widthMm: w,
    finish: finish.name,
    qty: 1,
    included: false,
  };

  if (mod.family === "FIL") {
    const h = FILLER_HEIGHT[p.layer];
    const shutterSqft = sqft(w * h);
    const shutterCost = Math.round(shutterSqft * finish.ratePerSqft);
    return {
      ...common,
      description: mod.name,
      heightMm: h,
      depthMm: FILLER_DEPTH_MM,
      carcassSqft: 0,
      carcassCost: 0,
      shutterSqft,
      shutterCost,
      amount: shutterCost,
    };
  }

  const h = mod.heightMm;
  const d = mod.depthMm;
  const carcass = getCarcass(cat, p.carcassId);
  const shutter = getShutterType(cat, p.shutterTypeId);
  const carcassSqft = sqft(2 * h * d + 2 * w * d + w * h);
  const carcassCost = Math.round(carcassSqft * carcass.ratePerSqft);
  const shutterSqft = sqft(w * h);
  const shutterCost = Math.round(shutterSqft * (finish.ratePerSqft + shutter.adderPerSqft));
  return {
    ...common,
    description: mod.name,
    heightMm: h,
    depthMm: d,
    carcassSqft,
    carcassCost,
    shutterSqft,
    shutterCost,
    amount: carcassCost + shutterCost,
  };
}

/** Chargeable add-on hardware fitted to one unit. */
export function addOnTotal(p: ModulePlacement, cat: Catalogue): number {
  return p.hardware.reduce((s, h) => s + getHardware(cat, h.itemId).price * h.qty, 0);
}

/** What one unit adds to the quote: carcass, shutters and its paid hardware. */
export function unitPrice(p: ModulePlacement, cat: Catalogue): number {
  return moduleLine(p, cat).amount + addOnTotal(p, cat);
}

/** Included hardware, totalled across the project, plus chargeable add-ons per unit. */
function hardwareLines(project: Project, cat: Catalogue): PriceLine[] {
  const includedQty = new Map<string, number>();
  const addIncluded = (id: string, qty: number) => {
    if (qty > 0) includedQty.set(id, (includedQty.get(id) ?? 0) + qty);
  };
  const lines: PriceLine[] = [];

  for (const p of project.modules) {
    const mod = getModule(cat, p.moduleCode);
    const { shutters, drawers } = mod.fronts;
    addIncluded("hinge-soft-close", 2 * shutters);
    if (p.shutterTypeId !== "handleless") addIncluded("handle-profile", shutters + drawers);
    const premium = p.hardware.some((h) => h.itemId === "drawer-premium");
    if (drawers > 0 && !premium) addIncluded("drawer-standard", 1);

    for (const sel of p.hardware) {
      const item = getHardware(cat, sel.itemId);
      const amount = item.price * sel.qty;
      lines.push({
        ...blank,
        group: "hardware",
        placementId: p.id,
        code: item.id,
        description: `${item.name} — ${mod.code}, Wall ${p.wallId}`,
        wall: p.wallId,
        qty: sel.qty,
        included: item.included,
        amount,
      });
    }
  }

  const included: PriceLine[] = [...includedQty].map(([id, qty]) => {
    const item = getHardware(cat, id);
    return { ...blank, group: "hardware", code: id, description: item.name, qty, included: true, amount: 0 };
  });
  return [...lines, ...included];
}

/** What an appliance itself costs: nothing if the customer supplies it. Its cut-out is charged either way. */
export function appliancePrice(a: AppliancePlacement, cat: Catalogue): number {
  return a.suppliedBy === "customer" ? 0 : getAppliance(cat, a.applianceId).price;
}

/** Cut-out charge for a fitted sink or hob, 0 otherwise. */
export function cutOutPrice(a: AppliancePlacement, cat: Catalogue): number {
  const spec = getAppliance(cat, a.applianceId);
  return a.kind === "hosted" && spec.cutOut ? spec.cutOut.price : 0;
}

function applianceLines(project: Project, cat: Catalogue): PriceLine[] {
  const lines: PriceLine[] = [];
  for (const a of project.appliances) {
    const spec = getAppliance(cat, a.applianceId);
    lines.push({
      ...blank,
      group: "appliances",
      placementId: a.id,
      code: spec.id,
      description: a.suppliedBy === "customer" ? `${spec.name} (customer's own)` : spec.name,
      widthMm: spec.widthMm,
      heightMm: spec.heightMm,
      depthMm: spec.depthMm,
      qty: 1,
      included: false,
      amount: appliancePrice(a, cat),
    });
    if (a.kind === "hosted" && spec.cutOut) {
      lines.push({
        ...blank,
        group: "appliances",
        placementId: a.id,
        code: `${spec.id}-cutout`,
        description: `${spec.name} cut-out ${spec.cutOut.widthMm} × ${spec.cutOut.depthMm} mm`,
        qty: 1,
        included: false,
        amount: spec.cutOut.price,
      });
    }
  }

  const outline = countertopOutline(project, cat);
  if (outline.slabs.length) {
    const area = sqft(outline.slabs.reduce((s, slab) => s + rectArea(slab.rect), 0));
    lines.push({
      ...blank,
      group: "appliances",
      code: "countertop",
      description: `Countertop, ${cat.countertop.name} · ${area} sq ft`,
      qty: 1,
      included: false,
      amount: Math.round(area * cat.countertop.ratePerSqft),
    });
  }
  return lines;
}

/** Line items and totals for a project. Pure. */
export function priceProject(project: Project, cat: Catalogue): Pricing {
  const lines = [
    ...project.modules.map((p) => moduleLine(p, cat)),
    ...hardwareLines(project, cat),
    ...applianceLines(project, cat),
  ];

  const groups: GroupTotal[] = (Object.keys(PRICE_GROUP_LABELS) as PriceGroup[]).map((group) => {
    const inGroup = lines.filter((l) => l.group === group);
    const sum = (f: (l: PriceLine) => number) => inGroup.reduce((s, l) => s + f(l), 0);
    return {
      group,
      label: PRICE_GROUP_LABELS[group],
      count: inGroup.length,
      carcassSqft: round2(sum((l) => l.carcassSqft)),
      carcassCost: sum((l) => l.carcassCost),
      shutterSqft: round2(sum((l) => l.shutterSqft)),
      shutterCost: sum((l) => l.shutterCost),
      amount: sum((l) => l.amount),
    };
  });

  const subtotal = groups.reduce((s, g) => s + g.amount, 0);
  const discount = Math.round((subtotal * project.discountPct) / 100);
  const taxableValue = subtotal - discount;
  const gstPct = cat.commercial.gstPct;
  const gst = Math.round((taxableValue * gstPct) / 100);
  return {
    lines,
    groups,
    subtotal,
    discountPct: project.discountPct,
    discount,
    taxableValue,
    gstPct,
    gst,
    grandTotal: taxableValue + gst,
  };
}
