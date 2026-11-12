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
    expect(Object.keys(saved.state)).toEqual(["project", "settings"]);

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
    expect(Object.keys(saved.state)).toEqual(["project", "settings"]);

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

describe("appliances in the store", () => {
  it("removing a host removes its fitted appliances in one step; one undo restores both", () => {
    const store = createProjectStore(sampleDesign);
    const steps = store.getState().past.length;
    store.getState().removePlacement("m-sink");
    const after = store.getState().project;
    expect(after.modules.some((m) => m.id === "m-sink")).toBe(false);
    expect(after.appliances.some((a) => a.id === "a-sink")).toBe(false);
    expect(store.getState().past.length).toBe(steps + 1);
    store.getState().undo();
    expect(store.getState().project).toBe(sampleDesign);
  });

  it("a loose sink placed with the composite fix adds the sink unit and the sink as one step", () => {
    const store = createProjectStore(emptyMehta);
    const res = store.getState().tryPlaceAppliance({ kind: "free", applianceId: "sink", wallId: "A", layer: "base", offsetMm: 1210 });
    expect(res.ok).toBe(false);
    expect(store.getState().past).toHaveLength(0);
    const fix = res.results[0].fixes[0];
    const placed = store.getState().placeWithFix({ kind: "free", id: res.id, applianceId: "sink", wallId: "A", layer: "base", offsetMm: 1210 }, fix);
    expect(placed.ok).toBe(true);
    const { project, past, ui } = store.getState();
    expect(past).toHaveLength(1);
    expect(project.modules.map((m) => m.moduleCode)).toEqual(["SU900"]);
    expect(project.appliances).toEqual([{ kind: "hosted", id: res.id, applianceId: "sink", hostPlacementId: project.modules[0].id }]);
    expect(ui.selectedPlacementId).toBe(res.id);
    store.getState().undo();
    expect(store.getState().project).toBe(emptyMehta);
  });

  it("fitting an appliance selects it; supplied-by is one undoable step", () => {
    const store = createProjectStore({ ...emptyMehta, modules: [unit("su", "SU900", "A", 1200, 900)] });
    const res = store.getState().tryPlaceAppliance({ kind: "hosted", applianceId: "sink", hostPlacementId: "su" });
    expect(res.ok).toBe(true);
    expect(store.getState().ui.selectedPlacementId).toBe(res.id);
    const steps = store.getState().past.length;
    store.getState().setSuppliedBy(res.id, "customer");
    expect(store.getState().project.appliances[0].suppliedBy).toBe("customer");
    store.getState().setSuppliedBy(res.id, "customer");
    expect(store.getState().past.length).toBe(steps + 1);
    store.getState().undo();
    expect(store.getState().project.appliances[0].suppliedBy).toBeUndefined();
  });
});

describe("quote workflow in the store", () => {
  const clock = () => "2026-10-09T10:30:00.000Z";
  const quoted = () => {
    const store = createProjectStore(sampleDesign, undefined, clock);
    store.getState().ensureQuote();
    return store;
  };

  it("assigns the quote number once and moves the sequence on; never an undo step", () => {
    const store = quoted();
    expect(store.getState().project.quote!.number).toBe("MMK-AND-2026-0147");
    expect(store.getState().settings.nextQuoteSeq).toBe(148);
    store.getState().ensureQuote();
    expect(store.getState().settings.nextQuoteSeq).toBe(148);
    expect(store.getState().past).toHaveLength(0);
  });

  it("logs discount changes; above 5% needs approval", () => {
    const store = quoted();
    store.getState().setDiscount(5);
    store.getState().setDiscount(8);
    const log = store.getState().project.activity!.filter((a) => a.action === "discount_changed").map((a) => a.detail);
    expect(log).toEqual(["Discount 0% → 5% · within salesperson limit", "Discount 5% → 8% · needs manager approval"]);
    expect(store.getState().past).toHaveLength(2);
  });

  it("a design change while approved returns to draft as version 2, in the same undo step; undo keeps the paperwork", () => {
    const store = quoted();
    const s = () => store.getState();
    s().sendForApproval();
    s().setRole("manager");
    s().approve();
    expect(s().project.quote!.approvedBy).toBe("Store Manager");
    s().setRole("salesperson");
    const steps = s().past.length;
    s().updatePlacement("m-hob", { finishId: "laminate-walnut" });
    expect(s().project.status).toBe("draft");
    expect(s().project.quote!.version).toBe(2);
    expect(s().ui.returnedToDraft).toEqual({ version: 2, n: 1 });
    expect(s().past.length).toBe(steps + 1);
    expect(s().project.activity!.slice(-2).map((a) => a.action)).toEqual(["returned_to_draft", "version_created"]);
    s().undo();
    expect(s().project.modules.find((m) => m.id === "m-hob")!.finishId).toBe("matte-sage");
    expect(s().project.status).toBe("draft");
    expect(s().project.quote!.version).toBe(2);
  });

  it("sent back with a comment by the manager; role and approval mode survive loading a project", () => {
    const store = quoted();
    store.getState().sendForApproval();
    store.getState().setRole("manager");
    store.getState().sendBack("Please check the sink position");
    expect(store.getState().project.quote!.sentBack!.comment).toBe("Please check the sink position");
    expect(store.getState().project.activity!.at(-1)!.by).toBe("Store Manager");
    store.getState().setApprovalMode("flagged");
    store.getState().loadProject(emptyMehta);
    expect(store.getState().settings).toMatchObject({ role: "manager", approvalMode: "flagged" });
  });
});

describe("undo after approval", () => {
  it("undoing a design change on an approved quote returns it to draft as a new version", () => {
    const store = createProjectStore(sampleDesign, undefined, () => "2026-10-09T10:30:00.000Z");
    const s = () => store.getState();
    s().ensureQuote();
    s().setDiscount(5);
    s().sendForApproval();
    s().approve();
    s().undo();
    expect(s().project.discountPct).toBe(0);
    expect(s().project.status).toBe("draft");
    expect(s().project.quote!.version).toBe(2);
  });
});
