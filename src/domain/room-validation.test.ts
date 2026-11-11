import { describe, expect, it } from "vitest";
import { emptyMehta } from "./seed";
import { closingHint, cornerNames, perpendicularHeadings, validateRoom } from "./room-validation";
import type { Feature, Room } from "./types";

const mehta = emptyMehta.room;
const withFeatures = (features: Feature[], room: Room = mehta): Room => ({ ...room, features });
const replaceFeature = (id: string, patch: Partial<Feature>): Room => ({
  ...mehta,
  features: mehta.features.map((f) => (f.id === id ? ({ ...f, ...patch } as Feature) : f)),
});

describe("validateRoom", () => {
  it("accepts the Mehta room", () => {
    expect(validateRoom(mehta)).toEqual({ ok: true, issues: [] });
  });

  it("needs walls, positive lengths and a closed room", () => {
    expect(validateRoom({ ...mehta, walls: [] }).ok).toBe(false);
    const zero = validateRoom({ ...mehta, walls: mehta.walls.map((w) => (w.id === "C" ? { ...w, lengthMm: 0 } : w)) });
    expect(zero.issues).toContainEqual({ wallId: "C", message: "Wall C needs a length." });
    const open = validateRoom({ ...mehta, walls: mehta.walls.slice(0, 7), features: [] });
    expect(open.issues.map((i) => i.message)).toEqual(["The room isn't closed yet (open by 2400 mm)."]);
  });

  it("rejects a feature that runs off its wall", () => {
    const r = validateRoom(replaceFeature("f-window", { offsetMm: 2500 }));
    expect(r.issues).toEqual([
      { featureId: "f-window", message: "Window (2500–3400 mm) doesn't fit on Wall A, which is 3200 mm long." },
    ]);
  });

  it("checks window, door and beam heights against the ceiling", () => {
    expect(validateRoom(replaceFeature("f-window", { sillMm: 2100 })).issues[0].message).toBe("The window sill must be below its top.");
    expect(validateRoom(replaceFeature("f-window", { topMm: 2900 })).issues[0].message).toMatch(/above the ceiling/);
    expect(validateRoom(replaceFeature("f-door", { heightMm: 2900 })).issues[0].featureId).toBe("f-door");
    expect(validateRoom(replaceFeature("f-beam", { bottomMm: 2900 })).issues[0].featureId).toBe("f-beam");
  });

  it("needs columns inside the room, including clear of the duct-box notch", () => {
    expect(validateRoom(replaceFeature("f-column", { x: -100 })).issues[0].message).toBe("The column is outside the room.");
    // The notch is x 1000–1600, y 1950–2400.
    expect(validateRoom(withFeatures([{ kind: "column", id: "c", x: 1100, y: 2000, widthMm: 300, depthMm: 300 }])).ok).toBe(false);
    expect(validateRoom(withFeatures([{ kind: "column", id: "c", x: 1100, y: 1650, widthMm: 300, depthMm: 300 }])).ok).toBe(true);
  });

  it("flags features on missing walls", () => {
    const r = validateRoom(withFeatures([{ kind: "plumbing", id: "p", wallId: "Z", offsetMm: 100 }]));
    expect(r.issues[0]).toEqual({ featureId: "p", message: "Plumbing is on Wall Z, which no longer exists." });
  });
});

describe("closingHint", () => {
  it("is null for a closed room", () => {
    expect(closingHint(mehta)).toBeNull();
  });

  it("closes a U-shaped room with one wall", () => {
    const room: Room = {
      ...mehta,
      walls: [
        { id: "A", lengthMm: 3000, heading: "E" },
        { id: "B", lengthMm: 2000, heading: "S" },
        { id: "C", lengthMm: 3000, heading: "W" },
      ],
    };
    expect(closingHint(room)).toEqual({ dx: 0, dy: -2000, walls: [{ heading: "N", lengthMm: 2000 }], valid: true, summary: "2000 mm" });
  });

  it("closes an L with two walls, turning off the last wall first", () => {
    const room: Room = { ...mehta, walls: [{ id: "A", lengthMm: 3000, heading: "E" }, { id: "B", lengthMm: 2400, heading: "S" }] };
    expect(closingHint(room)).toMatchObject({
      dx: -3000,
      dy: -2400,
      walls: [
        { heading: "W", lengthMm: 3000 },
        { heading: "N", lengthMm: 2400 },
      ],
      valid: true,
      summary: "2400 mm × 3000 mm",
    });
  });

  it("marks closures that would double back as invalid", () => {
    const room: Room = { ...mehta, walls: [{ id: "A", lengthMm: 3000, heading: "E" }] };
    expect(closingHint(room)?.valid).toBe(false);
  });
});

describe("helpers", () => {
  it("only allows right-angle turns", () => {
    expect(perpendicularHeadings("E")).toEqual(["N", "S"]);
    expect(perpendicularHeadings("N")).toEqual(["E", "W"]);
  });

  it("names corners by their walls", () => {
    expect(cornerNames(mehta)[0]).toEqual({ point: { x: 0, y: 0 }, name: "A/H" });
  });
});
