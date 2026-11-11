// SAMPLE DATA for demo only — not Makwana's real catalogue or prices.

import type { Catalogue, CatalogueModule } from "./types";

const BASE_H = 720;
const BASE_D = 560;
const WALL_H = 720;
const WALL_D = 350;
const TALL_H = 2100;

const STD_WIDTHS = [300, 450, 600, 750, 900] as const;

/** Single-shutter up to 450, double from 600. */
const shuttersFor = (w: number) => (w <= 450 ? 1 : 2);

const LIFT_UP = ["lift-up"];
const DRAWER_ADDONS = ["drawer-premium", "cutlery-organiser"];

const modules: CatalogueModule[] = [
  ...STD_WIDTHS.map(
    (w): CatalogueModule => ({
      code: `B${w}`,
      name: "Base shutter unit",
      family: "B",
      layer: "base",
      widthMm: w,
      heightMm: BASE_H,
      depthMm: BASE_D,
      fronts: { shutters: shuttersFor(w), drawers: 0 },
      allowedHardwareIds: [],
    }),
  ),
  ...([450, 600, 750, 900] as const).map(
    (w): CatalogueModule => ({
      code: `BD${w}`,
      name: "Base 2-drawer unit",
      family: "BD",
      layer: "base",
      widthMm: w,
      heightMm: BASE_H,
      depthMm: BASE_D,
      fronts: { shutters: 0, drawers: 2 },
      allowedHardwareIds: DRAWER_ADDONS,
    }),
  ),
  {
    code: "SU900",
    name: "Sink unit",
    family: "SU",
    layer: "base",
    widthMm: 900,
    heightMm: BASE_H,
    depthMm: BASE_D,
    fronts: { shutters: 2, drawers: 0 },
    hosts: ["sink"],
    allowedHardwareIds: [],
  },
  {
    code: "HU900",
    name: "Hob unit with 3 drawers",
    family: "HU",
    layer: "base",
    widthMm: 900,
    heightMm: BASE_H,
    depthMm: BASE_D,
    fronts: { shutters: 0, drawers: 3 },
    hosts: ["hob"],
    allowedHardwareIds: DRAWER_ADDONS,
  },
  {
    code: "BC1000",
    name: "Blind corner base",
    family: "BC",
    layer: "base",
    widthMm: 1000,
    heightMm: BASE_H,
    depthMm: BASE_D,
    fronts: { shutters: 1, drawers: 0 },
    hasBlindSide: true,
    allowedHardwareIds: ["corner-carousel"],
  },
  ...STD_WIDTHS.map(
    (w): CatalogueModule => ({
      code: `W${w}`,
      name: "Wall unit",
      family: "W",
      layer: "wall",
      widthMm: w,
      heightMm: WALL_H,
      depthMm: WALL_D,
      fronts: { shutters: shuttersFor(w), drawers: 0 },
      allowedHardwareIds: LIFT_UP,
    }),
  ),
  ...STD_WIDTHS.map(
    (w): CatalogueModule => ({
      code: `L${w}`,
      name: "Loft",
      family: "L",
      layer: "loft",
      widthMm: w,
      heightMm: 400,
      depthMm: WALL_D,
      fronts: { shutters: shuttersFor(w), drawers: 0 },
      allowedHardwareIds: LIFT_UP,
    }),
  ),
  ...STD_WIDTHS.map(
    (w): CatalogueModule => ({
      code: `LS${w}`,
      name: "Short loft",
      family: "LS",
      layer: "loft",
      widthMm: w,
      heightMm: 300,
      depthMm: WALL_D,
      fronts: { shutters: shuttersFor(w), drawers: 0 },
      allowedHardwareIds: LIFT_UP,
    }),
  ),
  {
    code: "T600OM",
    name: "Tall oven + microwave housing",
    family: "T",
    layer: "tall",
    widthMm: 600,
    heightMm: TALL_H,
    depthMm: BASE_D,
    fronts: { shutters: 2, drawers: 0 },
    hosts: ["oven", "microwave"],
    allowedHardwareIds: [],
  },
  ...([450, 600] as const).map(
    (w): CatalogueModule => ({
      code: `TP${w}`,
      name: "Tall pantry",
      family: "TP",
      layer: "tall",
      widthMm: w,
      heightMm: TALL_H,
      depthMm: BASE_D,
      fronts: { shutters: 2, drawers: 0 },
      allowedHardwareIds: [],
    }),
  ),
  {
    // Width 1–100, set per placement; height and depth match the layer it sits in.
    code: "FIL",
    name: "Filler panel",
    family: "FIL",
    layer: "any",
    widthMm: 100,
    heightMm: 0,
    depthMm: 0,
    fronts: { shutters: 0, drawers: 0 },
    allowedHardwareIds: [],
  },
];

export const FILLER_MAX_MM = 100;

export const catalogue: Catalogue = {
  modules,
  carcasses: [
    { id: "bwp", name: "BWP Plywood", ratePerSqft: 282 },
    { id: "hdhmr", name: "HDHMR", ratePerSqft: 220 },
  ],
  finishes: [
    { id: "acrylic-ivory", name: "Acrylic High Gloss – Ivory", hex: "#F1EDE4", ratePerSqft: 1100 },
    { id: "matte-sage", name: "Matte Lacquer – Sage Green", hex: "#9DAF94", ratePerSqft: 900 },
    { id: "laminate-charcoal", name: "Laminate – Charcoal", hex: "#3A3A3A", ratePerSqft: 650 },
    { id: "laminate-walnut", name: "Laminate – Walnut", hex: "#7A5434", ratePerSqft: 650 },
  ],
  shutterTypes: [
    { id: "standard", name: "Standard with handle", adderPerSqft: 0 },
    { id: "handleless", name: "Handleless profile", adderPerSqft: 150 },
    { id: "glass", name: "Glass frame", adderPerSqft: 400 },
    { id: "appliance-housing", name: "Appliance housing", adderPerSqft: 0 },
  ],
  hardware: [
    { id: "hinge-soft-close", name: "Soft-close hinges", price: 0, included: true },
    { id: "handle-profile", name: "Profile handle, matte black", price: 0, included: true },
    { id: "drawer-standard", name: "Drawer system, standard", price: 0, included: true },
    { id: "drawer-premium", name: "Drawer system, premium tandem box", price: 6300, included: false },
    { id: "cutlery-organiser", name: "Cutlery organiser", price: 2400, included: false },
    { id: "lift-up", name: "Lift-up mechanism", price: 3900, included: false },
    { id: "corner-carousel", name: "Corner carousel", price: 14800, included: false },
  ],
  appliances: [
    {
      id: "hob",
      name: "4-burner hob",
      widthMm: 860,
      heightMm: 100,
      depthMm: 510,
      price: 21500,
      hosted: true,
      layer: "base",
      cutOut: { widthMm: 730, depthMm: 430, price: 1200 },
    },
    {
      id: "sink",
      name: "Single-bowl sink",
      widthMm: 900,
      heightMm: 220,
      depthMm: 500,
      price: 11400,
      hosted: true,
      layer: "base",
      cutOut: { widthMm: 750, depthMm: 450, price: 1200 },
    },
    { id: "chimney", name: "90 cm chimney", widthMm: 900, heightMm: 500, depthMm: 500, price: 32900, hosted: false, layer: "wall" },
    { id: "oven", name: "Built-in oven", widthMm: 595, heightMm: 595, depthMm: 560, price: 48000, hosted: true, layer: "tall" },
    { id: "microwave", name: "Microwave", widthMm: 595, heightMm: 390, depthMm: 400, price: 22000, hosted: true, layer: "tall" },
    { id: "dishwasher", name: "Dishwasher", widthMm: 600, heightMm: 820, depthMm: 560, price: 45000, hosted: false, layer: "base" },
    { id: "fridge", name: "Refrigerator space", widthMm: 900, heightMm: 2100, depthMm: 700, price: 0, hosted: false, layer: "tall" },
  ],
  countertop: { name: "Quartz 40 mm", thicknessMm: 40, depthMm: 600, ratePerSqft: 3400 },
  commercial: { discountLimitPct: 5, gstPct: 18 },
};

// ---------------------------------------------------------------------------
// Lookups. They throw on unknown ids: a dangling reference is a programming error.

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Unknown ${what}`);
  return value;
}

export const getModule = (cat: Catalogue, code: string) =>
  must(cat.modules.find((m) => m.code === code), `module ${code}`);
export const findModule = (cat: Catalogue, code: string) => cat.modules.find((m) => m.code === code);
export const getAppliance = (cat: Catalogue, id: string) =>
  must(cat.appliances.find((a) => a.id === id), `appliance ${id}`);
export const getFinish = (cat: Catalogue, id: string) =>
  must(cat.finishes.find((f) => f.id === id), `finish ${id}`);
export const getCarcass = (cat: Catalogue, id: string) =>
  must(cat.carcasses.find((c) => c.id === id), `carcass ${id}`);
export const getShutterType = (cat: Catalogue, id: string) =>
  must(cat.shutterTypes.find((s) => s.id === id), `shutter type ${id}`);
export const getHardware = (cat: Catalogue, id: string) =>
  must(cat.hardware.find((h) => h.id === id), `hardware ${id}`);

/** Same-family module of the given width, if the catalogue has one. */
export const moduleInFamily = (cat: Catalogue, family: string, widthMm: number) =>
  cat.modules.find((m) => m.family === family && m.widthMm === widthMm && m.family !== "FIL");
