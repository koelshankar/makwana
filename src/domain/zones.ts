// Vertical zones, in mm above finished floor.
export const ZONES = {
  plinth: { bottom: 0, top: 100 },
  baseCarcass: { bottom: 100, top: 820 },
  countertop: { bottom: 820, top: 860 },
  wall: { bottom: 1380, top: 2100 },
  loft: { bottom: 2100 }, // height comes from the module (400 or 300)
  tall: { bottom: 0, top: 2100 },
  chimney: { top: 2100 }, // chimney hood hangs from the top of the wall-unit zone
} as const;

/** Depth of the countertop band measured from the wall, used for base-run occupancy. */
export const COUNTERTOP_DEPTH_MM = 600;

/** Wall thickness drawn outside the room interior (3D and plan only). */
export const WALL_THICKNESS_MM = 100;

/** Bottom of the appliances housed in a tall unit (oven low, microwave above it). */
export const FITTED_BOTTOM_MM: Record<string, number> = { oven: 700, microwave: 1350 };
