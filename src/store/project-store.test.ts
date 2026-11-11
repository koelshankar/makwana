import { describe, expect, it } from "vitest";
import { placementsOnWall } from "@/domain/geometry";
import { emptyMehta, sampleDesign } from "@/domain/seed";
import { unit } from "@/domain/testing";
import type { ModulePlacement } from "@/domain/types";
import { createProjectStore, PERSIST_KEY, PERSIST_VERSION, type NewModule } from "./project-store";

/** A placement without an id, so the store assigns one. */
function draft(m: ModulePlacement): NewModule {
  const copy: NewModule = { ...m };
  delete copy.id;
  return copy;
}

describe("project store", () => {
  it("refuses a blocked drop without committing, and commits a clean one", () => {
    const store = createProjectStore(emptyMehta);
    const overWindow = draft(unit("x", "T600OM", "A", 1300, 600, "tall", { shutterTypeId: "appliance-housing" }));
    const refused = store.getState().tryPlaceModule(overWindow);
    expect(refused.ok).toBe(false);
    expect(refused.results.some((r) => r.ruleId === "covers-window")).toBe(true);
    expect(store.getState().project.modules).toHaveLength(0);

    const placed = store.getState().tryPlaceModule({ ...overWindow, offsetMm: 700 });
    expect(placed.ok).toBe(true);
    expect(store.getState().project.modules.map((m) => m.offsetMm)).toEqual([700]);
    expect(store.getState().ui.selectedPlacementId).toBe(placed.id);
  });

  it("refuses a move into an overlap and applies a fix from the results", () => {
    const store = createProjectStore(emptyMehta);
    const corner = draft(unit("x", "BC1000", "A", 2200, 1000));
    const b600 = draft(unit("y", "B600", "B", 600, 600));
    store.getState().tryPlaceModule(corner);
    const { id } = store.getState().tryPlaceModule(b600);

    const move = store.getState().movePlacement(id, "B", 0);
    expect(move.ok).toBe(false);
    const overlap = move.results.find((r) => r.ruleId === "overlap")!;
    expect(store.getState().project.modules.find((m) => m.id === id)?.offsetMm).toBe(600);

    store.getState().applyFix(overlap.fixes[0]);
    expect(store.getState().project.modules.find((m) => m.id === id)?.offsetMm).toBe(560);
  });

  it("removing a host removes its appliances; removing a wall removes what is on it", () => {
    const store = createProjectStore(sampleDesign);
    store.getState().removePlacement("m-tall");
    expect(store.getState().project.appliances.map((a) => a.id)).not.toContain("a-oven");

    store.getState().removeWall("A");
    const { project } = store.getState();
    expect(project.modules.every((m) => m.wallId !== "A")).toBe(true);
    expect(project.appliances).toEqual([]);
    expect(project.room.features.some((f) => f.kind === "window")).toBe(false);
  });

  it("rejects hardware that a module can't take", () => {
    const store = createProjectStore(sampleDesign);
    expect(store.getState().updatePlacement("m-bd1", { hardware: [{ itemId: "corner-carousel", qty: 1 }] })).toBe(false);
    expect(store.getState().updatePlacement("m-bd1", { hardware: [{ itemId: "drawer-premium", qty: 1 }], finishId: "laminate-walnut" })).toBe(true);
    expect(store.getState().project.modules.find((m) => m.id === "m-bd1")?.finishId).toBe("laminate-walnut");
  });
});

describe("undo / redo", () => {
  it("undoes and redoes room edits, and a new edit clears redo", () => {
    const store = createProjectStore(emptyMehta);
    store.getState().setCeiling(2700);
    store.getState().updateWall("A", { lengthMm: 3300 });
    expect(store.getState().past).toHaveLength(2);

    store.getState().undo();
    expect(store.getState().project.room.walls[0].lengthMm).toBe(3200);
    store.getState().undo();
    expect(store.getState().project.room.ceilingHeightMm).toBe(2850);
    expect(store.getState().project).toBe(emptyMehta);

    store.getState().redo();
    expect(store.getState().project.room.ceilingHeightMm).toBe(2700);
    store.getState().setCeiling(2600);
    expect(store.getState().future).toEqual([]);
  });

  it("covers placements and fixes, ignores selection, and caps history at 50", () => {
    const store = createProjectStore(sampleDesign);
    store.getState().select("m-bd1");
    expect(store.getState().past).toHaveLength(0);
    store.getState().removePlacement("m-bd1");
    expect(store.getState().ui.selectedPlacementId).toBeNull();
    store.getState().undo();
    expect(store.getState().project.modules.some((m) => m.id === "m-bd1")).toBe(true);

    for (let i = 0; i < 60; i++) store.getState().setCeiling(2500 + i);
    expect(store.getState().past).toHaveLength(50);
  });

  it("appends closing walls as one step and loading a project clears history", () => {
    const store = createProjectStore(emptyMehta);
    store.getState().appendWalls([
      { heading: "N", lengthMm: 100 },
      { heading: "E", lengthMm: 100 },
    ]);
    expect(store.getState().project.room.walls.map((w) => w.id).slice(-2)).toEqual(["I", "J"]);
    store.getState().undo();
    expect(store.getState().project.room.walls).toHaveLength(8);
    store.getState().loadProject(sampleDesign);
    expect(store.getState().past).toEqual([]);
  });
});

describe("persistence", () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      data,
      storage: () => ({
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      }),
    };
  }

  it("saves the project and restores it, without history", async () => {
    const mem = memoryStorage();
    const a = createProjectStore(emptyMehta, mem.storage);
    a.getState().setProjectInfo({ customerName: "Priya Shah" });
    const saved = JSON.parse(mem.data.get(PERSIST_KEY)!);
    expect(saved.version).toBe(PERSIST_VERSION);
    expect(Object.keys(saved.state)).toEqual(["project"]);

    const b = createProjectStore(sampleDesign, mem.storage);
    await b.persist.rehydrate();
    expect(b.getState().project.customerName).toBe("Priya Shah");
  });

  it("falls back to the seed when the stored version doesn't match", async () => {
    const mem = memoryStorage();
    mem.data.set(PERSIST_KEY, JSON.stringify({ version: 1, state: { project: { broken: true } } }));
    const store = createProjectStore(sampleDesign, mem.storage);
    await store.persist.rehydrate();
    expect(store.getState().project).toEqual(sampleDesign);
  });
});

describe("hydration gate", () => {
  it("reports hydrated only after the saved project is restored, even when there is none", async () => {
    const empty = createProjectStore(sampleDesign, () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }));
    expect(empty.persist.hasHydrated()).toBe(false);
    await empty.persist.rehydrate();
    expect(empty.persist.hasHydrated()).toBe(true);

    const data = new Map([[PERSIST_KEY, JSON.stringify({ version: PERSIST_VERSION, state: { project: emptyMehta } })]]);
    const saved = createProjectStore(sampleDesign, () => ({
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: () => {},
    }));
    const seen: number[] = [];
    saved.persist.onFinishHydration((s) => seen.push(s.project.modules.length));
    // Before hydration the store still holds the seed: screens must not render it.
    expect(saved.getState().project.modules.length).toBe(sampleDesign.modules.length);
    await saved.persist.rehydrate();
    expect(seen).toEqual([0]);
  });
});

describe("UI slice", () => {
  it("is never part of undo history or persistence", () => {
    const data = new Map<string, string>();
    const store = createProjectStore(sampleDesign, () => ({
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: () => {},
    }));
    store.getState().select("m-wb1");
    store.getState().setDesignTab("plan");
    store.getState().setElevationZoom(1.5);
    store.getState().showWall("C");
    expect(store.getState().past).toEqual([]);
    expect(store.getState().ui).toMatchObject({ activeWallId: "C", designTab: "wall", elevationZoom: 1.5, selectedPlacementId: "m-wb1" });

    store.getState().setCeiling(2800);
    const saved = JSON.parse(data.get(PERSIST_KEY)!);
    expect(Object.keys(saved.state)).toEqual(["project"]);

    store.getState().undo();
    expect(store.getState().ui.activeWallId).toBe("C");
    expect(store.getState().ui.selectedPlacementId).toBe("m-wb1");
  });

  it("selecting a unit makes its wall active; a fitted appliance selects via its host's wall", () => {
    const store = createProjectStore(sampleDesign);
    store.getState().select("m-tall");
    expect(store.getState().ui.activeWallId).toBe("B");
    store.getState().select("a-sink");
    expect(store.getState().ui.activeWallId).toBe("A");
  });

  it("new units inherit the last finish used for their group", () => {
    const store = createProjectStore(emptyMehta);
    store.getState().tryPlaceModule(draft(unit("x", "B600", "A", 300, 600, "base", { finishId: "laminate-walnut", shutterTypeId: "handleless" })));
    expect(store.getState().finishFor("BD600")).toEqual({ finishId: "laminate-walnut", shutterTypeId: "handleless" });
    expect(store.getState().finishFor("W600")).toEqual({ finishId: "acrylic-ivory", shutterTypeId: "standard" });
  });
});

describe("undo granularity", () => {
  it("records exactly one step per completed action", () => {
    const store = createProjectStore(emptyMehta);
    const s = () => store.getState();
    const steps = () => s().past.length;

    const { id } = s().tryPlaceModule(draft(unit("x", "BD600", "B", 560, 600)));
    expect(steps()).toBe(1); // drop
    s().select(id);
    expect(steps()).toBe(1); // selection is not an edit

    s().movePlacement(id, "B", 640);
    expect(steps()).toBe(2); // move release
    s().movePlacement(id, "B", 640);
    expect(steps()).toBe(2); // releasing where it was is not an edit

    s().updatePlacement(id, { finishId: "laminate-walnut", shutterTypeId: "handleless" });
    expect(steps()).toBe(3); // inspector change, finish and shutter together

    s().updatePlacement(id, { hardware: [{ itemId: "drawer-premium", qty: 1 }] });
    expect(steps()).toBe(4);

    s().removePlacement(id);
    expect(steps()).toBe(5); // delete

    // A refused drop records nothing.
    expect(s().tryPlaceModule(draft(unit("y", "T600OM", "A", 1300, 600, "tall", { shutterTypeId: "appliance-housing" }))).ok).toBe(false);
    expect(steps()).toBe(5);

    for (let i = 0; i < 5; i++) s().undo();
    expect(s().project).toBe(emptyMehta);
  });

  it("places a blocked unit with a suggested fix as one step", () => {
    const store = createProjectStore(emptyMehta);
    const tall = draft(unit("t", "T600OM", "A", 1300, 600, "tall", { shutterTypeId: "appliance-housing" }));
    const refused = store.getState().tryPlaceModule(tall);
    const fix = refused.results.find((r) => r.ruleId === "covers-window")!.fixes[0];
    expect(fix.action.type).toBe("move");

    const placed = store.getState().placeWithFix(tall, fix);
    expect(placed.ok).toBe(true);
    expect(store.getState().past).toHaveLength(1);
    const unitAfter = store.getState().project.modules[0];
    expect(unitAfter.id).toBe(placed.id);
    expect(unitAfter.offsetMm).not.toBe(1300);
    expect(store.getState().ui.selectedPlacementId).toBe(placed.id);
  });

  it("removing a wall removes its units, and one undo restores both", () => {
    const store = createProjectStore(sampleDesign);
    expect(placementsOnWall(sampleDesign, "B").map((p) => p.id)).toEqual(["m-bd1", "m-bd2", "m-fil-b", "m-tall", "m-wb1", "m-lb1", "m-lb2"]);
    expect(placementsOnWall(sampleDesign, "A").map((p) => p.id)).toContain("a-chimney");

    store.getState().removeWall("B");
    expect(store.getState().project.modules.some((m) => m.wallId === "B")).toBe(false);
    expect(store.getState().project.appliances.some((a) => a.id === "a-oven")).toBe(false);
    store.getState().undo();
    expect(store.getState().project).toBe(sampleDesign);
  });
});
