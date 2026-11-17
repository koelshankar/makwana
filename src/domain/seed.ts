// SAMPLE DATA for demo only.

import type { AppliancePlacement, Layer, ModulePlacement, Project, Room } from "./types";

const mehtaRoom: Room = {
  walls: [
    { id: "A", lengthMm: 3200, heading: "E", label: "East · window" },
    { id: "B", lengthMm: 2400, heading: "S", label: "South · beam" },
    { id: "C", lengthMm: 1600, heading: "W", label: "West" },
    { id: "D", lengthMm: 450, heading: "N", label: "North · duct side" },
    { id: "E", lengthMm: 600, heading: "W", label: "West · duct face" },
    { id: "F", lengthMm: 450, heading: "S", label: "South · duct side" },
    { id: "G", lengthMm: 1000, heading: "W", label: "West" },
    { id: "H", lengthMm: 2400, heading: "N", label: "North · door" },
  ],
  ceilingHeightMm: 2850,
  features: [
    { kind: "window", id: "f-window", wallId: "A", offsetMm: 1300, widthMm: 900, sillMm: 1050, topMm: 2100 },
    { kind: "plumbing", id: "f-plumbing", wallId: "A", offsetMm: 1750 },
    { kind: "door", id: "f-door", wallId: "H", offsetMm: 400, widthMm: 800, heightMm: 2100 },
    { kind: "column", id: "f-column", x: 0, y: 0, widthMm: 300, depthMm: 300 },
    { kind: "beam", id: "f-beam", wallId: "B", bottomMm: 2400, depthMm: 200 },
    { kind: "ductBox", id: "f-duct", label: "D–F duct box", fromWallId: "D", toWallId: "F" },
  ],
};

export const emptyMehta: Project = {
  id: "mehta",
  name: "Mehta Residence",
  customerName: "Anil Mehta",
  siteAddress: "Andheri West, Mumbai",
  preparedBy: "Rohan Desai",
  kitchenType: "closed",
  room: mehtaRoom,
  modules: [],
  appliances: [],
  discountPct: 0,
  status: "draft",
};

/** A blank project with no walls, for building a room from scratch. */
export const newProject: Project = {
  id: "new",
  name: "New project",
  customerName: "",
  siteAddress: "",
  preparedBy: "Rohan Desai",
  kitchenType: "closed",
  room: { walls: [], ceilingHeightMm: 2700, features: [] },
  modules: [],
  appliances: [],
  discountPct: 0,
  status: "draft",
};

const BASE_FINISH = { carcassId: "bwp", finishId: "matte-sage", shutterTypeId: "standard" };
const UPPER_FINISH = { carcassId: "bwp", finishId: "acrylic-ivory", shutterTypeId: "standard" };
const TALL_FINISH = { carcassId: "bwp", finishId: "laminate-charcoal", shutterTypeId: "appliance-housing" };

function mod(
  id: string,
  moduleCode: string,
  wallId: string,
  layer: Layer,
  offsetMm: number,
  widthMm: number,
  finish: Pick<ModulePlacement, "carcassId" | "finishId" | "shutterTypeId">,
  hardware: ModulePlacement["hardware"] = [],
  extra: Partial<ModulePlacement> = {},
): ModulePlacement {
  return { id, moduleCode, wallId, layer, offsetMm, widthMm, ...finish, hardware, isCustomSize: false, ...extra };
}

const sampleModules: ModulePlacement[] = [
  // Wall A base: column occupies 0–300.
  mod("m-hob", "HU900", "A", "base", 300, 900, BASE_FINISH, [
    { itemId: "drawer-premium", qty: 1 },
    { itemId: "cutlery-organiser", qty: 1 },
  ]),
  mod("m-sink", "SU900", "A", "base", 1200, 900, BASE_FINISH),
  mod("m-fil-a", "FIL", "A", "base", 2100, 50, BASE_FINISH),
  // The blind corner unit is pulled 50 mm out of the corner (a corner filler behind it), so its door
  // clears BD600's drawers on wall B (the corner clash rule).
  mod("m-corner", "BC1000", "A", "base", 2150, 1000, BASE_FINISH, [{ itemId: "corner-carousel", qty: 1 }], {
    blindSide: "right",
  }),
  mod("m-fil-corner", "FIL", "A", "base", 3150, 50, BASE_FINISH),
  // Wall A uppers: window spans 1300–2200, chimney sits at 300–1200. W600 stays clear of the corner:
  // W900 on wall B stands in the first 350 mm in front of wall A, and their fronts need 50 mm.
  mod("m-wa1", "W600", "A", "wall", 2200, 600, UPPER_FINISH, [{ itemId: "lift-up", qty: 1 }]),
  mod("m-la1", "L600", "A", "loft", 300, 600, UPPER_FINISH),
  mod("m-la2", "L600", "A", "loft", 900, 600, UPPER_FINISH),
  mod("m-la3", "L600", "A", "loft", 1500, 600, UPPER_FINISH),
  mod("m-la4", "L600", "A", "loft", 2100, 600, UPPER_FINISH),
  // Wall B base: the BC1000 on wall A occupies the first 560 mm.
  mod("m-bd1", "BD600", "B", "base", 560, 600, BASE_FINISH),
  mod("m-bd2", "BD600", "B", "base", 1160, 600, BASE_FINISH),
  mod("m-fil-b", "FIL", "B", "base", 1760, 40, BASE_FINISH),
  mod("m-tall", "T600OM", "B", "tall", 1800, 600, TALL_FINISH),
  // Wall B uppers: W900 starts 350 mm out, clear of wall A's wall units; beam at 2400 → short lofts.
  mod("m-wb1", "W900", "B", "wall", 350, 900, UPPER_FINISH),
  mod("m-lb1", "LS900", "B", "loft", 600, 900, UPPER_FINISH),
  mod("m-lb2", "LS900", "B", "loft", 1500, 900, UPPER_FINISH),
];

const sampleAppliances: AppliancePlacement[] = [
  { kind: "hosted", id: "a-hob", applianceId: "hob", hostPlacementId: "m-hob" },
  { kind: "hosted", id: "a-sink", applianceId: "sink", hostPlacementId: "m-sink" },
  { kind: "free", id: "a-chimney", applianceId: "chimney", wallId: "A", layer: "wall", offsetMm: 300 },
  { kind: "hosted", id: "a-oven", applianceId: "oven", hostPlacementId: "m-tall" },
  { kind: "hosted", id: "a-microwave", applianceId: "microwave", hostPlacementId: "m-tall" },
];

export const sampleDesign: Project = {
  ...emptyMehta,
  modules: sampleModules,
  appliances: sampleAppliances,
};
