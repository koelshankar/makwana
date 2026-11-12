import { describe, expect, it } from "vitest";
import { snapshotStep, SNAPSHOT_TIMEOUT_MS } from "./snapshot-wait";

describe("print page 3D picture wait (#10)", () => {
  it("waits for the scene to settle, then shoots", () => {
    expect(snapshotStep(true, 3, 450)).toBe("wait");
    expect(snapshotStep(true, 7, 1050)).toBe("shoot");
  });
  it("gives up after 3 s if the scene never becomes ready, so the quote still prints", () => {
    expect(snapshotStep(false, 19, SNAPSHOT_TIMEOUT_MS - 1)).toBe("wait");
    expect(snapshotStep(false, 20, SNAPSHOT_TIMEOUT_MS)).toBe("give-up");
    expect(snapshotStep(false, 500, 75_000)).toBe("give-up");
  });
  it("a scene that is ready at the deadline still gets its picture taken", () => {
    expect(snapshotStep(true, 2, SNAPSHOT_TIMEOUT_MS)).toBe("shoot");
  });
});
