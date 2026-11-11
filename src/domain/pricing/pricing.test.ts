import { describe, expect, it } from "vitest";
import { catalogue } from "../catalogue";
import { formatINR } from "../format";
import { emptyMehta, sampleDesign } from "../seed";
import { unit } from "../testing";
import { priceProject, sqft } from "./index";

describe("priceProject", () => {
  it("prices one B600 in BWP + Matte Lacquer + Standard by hand", () => {
    // Carcass: 2 sides 720×560 + top/bottom 600×560 + back 600×720 = 1,910,400 mm² = 20.56 sqft.
    // Shutter: 600×720 = 432,000 mm² = 4.65 sqft.
    const p = { ...emptyMehta, modules: [unit("b", "B600", "A", 300, 600)] };
    const line = priceProject(p, catalogue).lines.find((l) => l.placementId === "b")!;
    expect(line).toMatchObject({
      code: "B600",
      wall: "A",
      widthMm: 600,
      heightMm: 720,
      depthMm: 560,
      finish: "Matte Lacquer – Sage Green",
      carcassSqft: 20.56,
      carcassCost: 5798, // 20.56 × 282 = 5797.92
      shutterSqft: 4.65,
      shutterCost: 4185, // 4.65 × 900
      amount: 9983,
    });
  });

  it("adds the shutter type adder and prices fillers on shutter area only", () => {
    const p = {
      ...emptyMehta,
      modules: [
        unit("b", "B600", "A", 300, 600, "base", { shutterTypeId: "handleless" }),
        unit("f", "FIL", "A", 900, 100),
      ],
    };
    const { lines } = priceProject(p, catalogue);
    expect(lines.find((l) => l.placementId === "b")!.shutterCost).toBe(Math.round(4.65 * (900 + 150)));
    // 100 × 720 = 72,000 mm² = 0.78 sqft × 900.
    expect(lines.find((l) => l.placementId === "f")).toMatchObject({ carcassCost: 0, shutterSqft: 0.78, shutterCost: 702, amount: 702 });
  });

  it("matches the mockup's square footage for a 900 base unit", () => {
    expect(sqft(2 * 720 * 560 + 2 * 900 * 560 + 900 * 720)).toBe(26.51);
    expect(sqft(900 * 720)).toBe(6.98);
  });

  it("lists included hardware at ₹0 and charges add-ons", () => {
    const { lines } = priceProject(sampleDesign, catalogue);
    const hw = (code: string) => lines.filter((l) => l.group === "hardware" && l.code === code);
    expect(hw("hinge-soft-close")).toEqual([expect.objectContaining({ qty: 42, included: true, amount: 0 })]);
    expect(hw("handle-profile")).toEqual([expect.objectContaining({ qty: 28, amount: 0 })]);
    expect(hw("drawer-standard")).toEqual([expect.objectContaining({ qty: 2, amount: 0 })]); // the HU900 has premium
    expect(hw("drawer-premium")[0].amount).toBe(6300);
    expect(hw("corner-carousel")[0].amount).toBe(14800);
  });

  it("prices appliances, cut-outs and the countertop for sampleDesign", () => {
    const { lines, groups } = priceProject(sampleDesign, catalogue);
    const countertop = lines.find((l) => l.code === "countertop")!;
    // A: 2900 × 600, B: 1200 × 600 (corner counted once) = 2,460,000 mm² = 26.48 sqft × 3400.
    expect(countertop.amount).toBe(90032);
    const appliances = groups.find((g) => g.group === "appliances")!;
    expect(appliances.amount).toBe(21500 + 11400 + 32900 + 48000 + 22000 + 1200 + 1200 + 90032);
  });

  it("computes subtotal, GST and grand total for sampleDesign", () => {
    const pricing = priceProject(sampleDesign, catalogue);
    const sumLines = pricing.lines.reduce((s, l) => s + l.amount, 0);
    expect(pricing.subtotal).toBe(sumLines);
    expect(pricing.groups.reduce((s, g) => s + g.amount, 0)).toBe(sumLines);
    expect(pricing.discount).toBe(0);
    expect(pricing.taxableValue).toBe(pricing.subtotal);
    expect(pricing.gst).toBe(Math.round(pricing.taxableValue * 0.18));
    expect(pricing.grandTotal).toBe(pricing.taxableValue + pricing.gst);
    // Regression pin so price changes are deliberate.
    expect(pricing.subtotal).toBe(399150);
    expect(pricing.gst).toBe(71847);
    expect(formatINR(pricing.grandTotal)).toBe("₹4,70,997");
  });

  it("applies the discount before GST", () => {
    const pricing = priceProject({ ...sampleDesign, discountPct: 5 }, catalogue);
    expect(pricing.discount).toBe(19958); // 5% of 3,99,150 = 19,957.5
    expect(pricing.taxableValue).toBe(379192);
    expect(pricing.gst).toBe(68255);
    expect(pricing.grandTotal).toBe(447447);
  });
});
