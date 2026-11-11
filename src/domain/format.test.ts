import { describe, expect, it } from "vitest";
import { formatINR } from "./format";

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(412800)).toBe("₹4,12,800");
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(999)).toBe("₹999");
    expect(formatINR(1000)).toBe("₹1,000");
    expect(formatINR(537457)).toBe("₹5,37,457");
    expect(formatINR(10000000)).toBe("₹1,00,00,000");
    expect(formatINR(-23972)).toBe("-₹23,972");
  });
});
