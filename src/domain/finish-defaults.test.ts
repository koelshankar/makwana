import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";
import { inheritedFinish } from "./finish-defaults";
import { emptyMehta, sampleDesign } from "./seed";

describe("inheritedFinish", () => {
  it("uses the most recent choice for the group first", () => {
    const recent = { base: { finishId: "laminate-walnut", shutterTypeId: "handleless" } };
    expect(inheritedFinish(sampleDesign, catalogue, "B600", recent)).toEqual({ finishId: "laminate-walnut", shutterTypeId: "handleless" });
  });

  it("then the group's units already placed: wall units and lofts share a group", () => {
    expect(inheritedFinish(sampleDesign, catalogue, "B600")).toEqual({ finishId: "matte-sage", shutterTypeId: "standard" });
    expect(inheritedFinish(sampleDesign, catalogue, "LS600")).toEqual({ finishId: "acrylic-ivory", shutterTypeId: "standard" });
  });

  it("falls back to the first finish and the first valid shutter", () => {
    expect(inheritedFinish(emptyMehta, catalogue, "W600")).toEqual({ finishId: "acrylic-ivory", shutterTypeId: "standard" });
    expect(inheritedFinish(emptyMehta, catalogue, "T600OM")).toEqual({ finishId: "acrylic-ivory", shutterTypeId: "appliance-housing" });
    // Handleless isn't made in Acrylic Ivory.
    const recent = { base: { finishId: "acrylic-ivory", shutterTypeId: "handleless" } };
    expect(inheritedFinish(emptyMehta, catalogue, "B600", recent).shutterTypeId).toBe("standard");
  });
});
