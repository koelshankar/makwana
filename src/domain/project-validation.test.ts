import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";
import { isUsableProject } from "./project-validation";
import { emptyMehta, newProject, sampleDesign } from "./seed";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("isUsableProject", () => {
  it("accepts the seeds after a JSON round trip", () => {
    for (const p of [emptyMehta, newProject, sampleDesign]) expect(isUsableProject(clone(p), catalogue)).toBe(true);
  });

  it("rejects anything that isn't a project", () => {
    for (const v of [undefined, null, 42, "x", [], {}, { broken: true }]) expect(isUsableProject(v, catalogue)).toBe(false);
  });

  it("rejects broken references and malformed numbers", () => {
    const cases: ((p: ReturnType<typeof clone<typeof sampleDesign>>) => void)[] = [
      (p) => (p.modules[0].moduleCode = "NOPE"),
      (p) => (p.modules[0].wallId = "Z"),
      (p) => (p.modules[0].finishId = "gold-leaf"),
      (p) => (p.modules[0].offsetMm = 12.5),
      (p) => ((p.modules[0] as { hardware: unknown }).hardware = null),
      (p) => (p.appliances = [{ kind: "hosted", id: "a", applianceId: "sink", hostPlacementId: "missing" }]),
      (p) => (p.modules = [p.modules[0], p.modules[0]]),
      (p) => (p.room.walls[0].lengthMm = -1),
      (p) => ((p.room as { features: unknown }).features = [{ kind: "window", id: "w", wallId: "Q", offsetMm: 0, widthMm: 900, sillMm: 1000, topMm: 2000 }]),
      (p) => ((p as { status: string }).status = "lost"),
      (p) => (p.discountPct = Number.NaN),
      (p) => ((p as { quote: unknown }).quote = { number: 7 }),
    ];
    for (const breakIt of cases) {
      const p = clone(sampleDesign);
      breakIt(p);
      expect(isUsableProject(p, catalogue)).toBe(false);
    }
  });
});
