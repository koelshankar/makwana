// Core domain types. All dimensions are integer millimetres; all money is integer rupees.
//
// World coordinates: x to the right, y downwards on screen (plan view), z upwards.
//
// Offsets along a wall (offsetMm on features and placements) are measured from the wall's
// LEFT end as seen from inside the room. For a room entered clockwise on screen (interior on
// the right of travel, positive signed area) this is the wall's start point; for a room
// entered counter-clockwise it is the wall's end point. This keeps offset 0 on the left of
// every elevation regardless of how the room was drawn.

export type Heading = "N" | "E" | "S" | "W";

export interface Wall {
  id: string; // "A".."Z"
  lengthMm: number;
  heading: Heading; // direction of travel along the wall
  label?: string; // short note shown in Room Setup, e.g. "East · window"
}

export interface WindowFeature {
  kind: "window";
  id: string;
  wallId: string;
  offsetMm: number;
  widthMm: number;
  sillMm: number;
  topMm: number;
}

export interface DoorFeature {
  kind: "door";
  id: string;
  wallId: string;
  offsetMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PlumbingFeature {
  kind: "plumbing";
  id: string;
  wallId: string;
  offsetMm: number;
}

export interface BeamFeature {
  kind: "beam";
  id: string;
  wallId: string;
  bottomMm: number; // spans the whole wall
  depthMm: number; // how far the beam projects into the room
}

export interface ColumnFeature {
  kind: "column";
  id: string;
  x: number; // world-space rectangle, top-left corner
  y: number;
  widthMm: number; // along x
  depthMm: number; // along y
}

export interface DuctBoxFeature {
  kind: "ductBox";
  id: string;
  label: string; // descriptive only; the notch itself is represented by walls
  /** Optional first and last notch walls (e.g. D and F); their extent is drawn hatched. */
  fromWallId?: string;
  toWallId?: string;
}

export type Feature =
  | WindowFeature
  | DoorFeature
  | PlumbingFeature
  | BeamFeature
  | ColumnFeature
  | DuctBoxFeature;

export interface Room {
  walls: Wall[];
  ceilingHeightMm: number;
  features: Feature[];
}

export type Layer = "base" | "wall" | "loft" | "tall";

export type BlindSide = "left" | "right";

export interface HardwareSelection {
  itemId: string;
  qty: number;
}

export interface ModulePlacement {
  id: string;
  moduleCode: string;
  wallId: string;
  layer: Layer;
  offsetMm: number;
  /** Only differs from the catalogue width for fillers and approved custom sizes. */
  widthMm: number;
  carcassId: string;
  finishId: string;
  shutterTypeId: string;
  /** Chargeable add-ons only. Included hardware is derived from the module. */
  hardware: HardwareSelection[];
  isCustomSize: boolean;
  /** Required for blind corner units (BC1000), absent for all others. Left/right as seen from inside. */
  blindSide?: BlindSide;
}

/** Sink/hob on a base host; oven/microwave in a tall host. Position derives from the host. */
export interface HostedAppliancePlacement {
  kind: "hosted";
  id: string;
  applianceId: string;
  hostPlacementId: string;
}

/** Chimney (wall layer), dishwasher (base), fridge space (tall). */
export interface FreeAppliancePlacement {
  kind: "free";
  id: string;
  applianceId: string;
  wallId: string;
  layer: Layer;
  offsetMm: number;
}

export type AppliancePlacement = HostedAppliancePlacement | FreeAppliancePlacement;

/** Anything that can sit on a wall and take part in fit checks. */
export type Placement = ModulePlacement | AppliancePlacement;

export type ProjectStatus = "draft" | "pending_approval" | "approved";

export type KitchenType = "closed" | "open" | "semi-open";

export interface Project {
  id: string;
  name: string;
  customerName: string;
  siteAddress: string;
  preparedBy: string;
  kitchenType: KitchenType;
  room: Room;
  modules: ModulePlacement[];
  appliances: AppliancePlacement[];
  discountPct: number;
  status: ProjectStatus;
}

// ---------------------------------------------------------------------------
// Catalogue

export type ModuleFamily =
  | "B"
  | "BD"
  | "SU"
  | "HU"
  | "BC"
  | "W"
  | "L"
  | "LS"
  | "T"
  | "TP"
  | "FIL";

export interface CatalogueModule {
  code: string;
  name: string;
  family: ModuleFamily;
  layer: Layer | "any"; // "any" for fillers, which match the layer they sit in
  widthMm: number;
  heightMm: number;
  depthMm: number;
  fronts: { shutters: number; drawers: number };
  hosts?: string[]; // appliance ids this module can host
  /** Blind corner units: the placement records which side is blind. */
  hasBlindSide?: boolean;
  allowedHardwareIds: string[];
}

export interface Carcass {
  id: string;
  name: string;
  ratePerSqft: number;
}

export interface Finish {
  id: string;
  name: string;
  hex: string;
  ratePerSqft: number;
}

export interface ShutterType {
  id: string;
  name: string;
  adderPerSqft: number;
}

export interface HardwareItem {
  id: string;
  name: string;
  price: number; // 0 for included items
  included: boolean;
}

export interface Appliance {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  price: number;
  hosted: boolean;
  layer: Layer; // layer of the host, or the layer a free appliance sits in
  cutOut?: { widthMm: number; depthMm: number; price: number };
}

export interface Catalogue {
  modules: CatalogueModule[];
  carcasses: Carcass[];
  finishes: Finish[];
  shutterTypes: ShutterType[];
  hardware: HardwareItem[];
  appliances: Appliance[];
  countertop: { name: string; thicknessMm: number; depthMm: number; ratePerSqft: number };
  commercial: { discountLimitPct: number; gstPct: number };
}

// ---------------------------------------------------------------------------
// Geometry

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// ---------------------------------------------------------------------------
// Rules

export type CheckStatus = "pass" | "warning" | "blocked" | "approval";
export type CheckGroup = "room" | "fit" | "product" | "appliance" | "commercial";

export type FixAction =
  | { type: "move"; placementId: string; wallId: string; offsetMm: number }
  | { type: "replace"; placementId: string; moduleCode: string }
  | { type: "replaceAndMove"; placementId: string; moduleCode: string; offsetMm: number }
  | { type: "addFiller"; wallId: string; layer: Layer; offsetMm: number; widthMm: number }
  | { type: "resize"; placementId: string; widthMm: number }
  | { type: "remove"; placementId: string }
  | { type: "setShutterType"; placementId: string; shutterTypeId: string }
  | { type: "setBlindSide"; placementId: string; blindSide: BlindSide };

export interface Fix {
  label: string;
  action: FixAction;
}

export interface CheckResult {
  ruleId: string;
  group: CheckGroup;
  status: CheckStatus;
  placementIds: string[];
  message: string;
  fixes: Fix[];
}
