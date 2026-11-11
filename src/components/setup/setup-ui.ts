import { create } from "zustand";

/** Canvas tools. "drawWall" just highlights the Add wall flow in the panel. */
export type Tool = "select" | "drawWall" | "opening" | "plumbing" | "column" | "beam";
export type OpeningKind = "window" | "door";

/** View state for Room Setup only (selection, tool). Project data lives in the project store. */
interface SetupUi {
  selectedWallId: string | null;
  selectedFeatureId: string | null;
  tool: Tool;
  openingKind: OpeningKind;
  addingWall: boolean;
  /** Feature whose edit popover should open (e.g. right after placing it). */
  editingFeatureId: string | null;
  selectWall: (id: string | null) => void;
  selectFeature: (id: string | null) => void;
  setTool: (tool: Tool, openingKind?: OpeningKind) => void;
  setAddingWall: (open: boolean) => void;
  editFeature: (id: string | null) => void;
}

export const useSetupUi = create<SetupUi>((set) => ({
  selectedWallId: "A",
  selectedFeatureId: null,
  tool: "select",
  openingKind: "window",
  addingWall: false,
  editingFeatureId: null,
  selectWall: (id) => set({ selectedWallId: id, selectedFeatureId: null }),
  selectFeature: (id) => set({ selectedFeatureId: id }),
  setTool: (tool, openingKind) =>
    set((s) => ({
      tool,
      openingKind: openingKind ?? s.openingKind,
      addingWall: tool === "drawWall" ? true : s.addingWall,
    })),
  setAddingWall: (open) => set((s) => ({ addingWall: open, tool: !open && s.tool === "drawWall" ? "select" : s.tool })),
  editFeature: (id) => set({ editingFeatureId: id, selectedFeatureId: id ?? null }),
}));
