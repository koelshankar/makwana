"use client";

import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getModule, catalogue } from "@/domain/catalogue";
import { projectStore, useBlockedIds, useProjectStore, useRoomValidation } from "@/store/project-store";
import { commitGhost } from "./commit";
import { DesignFooter } from "./design-footer";
import { ghostAt } from "./ghost";
import { Inspector } from "./inspector";
import { useInteraction, type ClientPoint } from "./interaction";
import { ModuleDragPreview, ModulesPanel } from "./modules-panel";
import { ThreePanel } from "./three-panel";
import { ViewsPanel } from "./views-panel";

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  // Menus, listboxes and tab strips use the arrow keys themselves.
  return !!target.closest('[role="listbox"],[role="menu"],[role="dialog"],[role="alertdialog"]');
}

/** Pointer position during a dnd-kit drag: where it started plus how far it moved. */
function pointerOf(e: DragMoveEvent | DragEndEvent): ClientPoint | null {
  const start = e.activatorEvent as PointerEvent | null;
  if (!start || !("clientX" in start)) return null;
  return { x: start.clientX + e.delta.x, y: start.clientY + e.delta.y };
}

/** Units that were blocked when the screen opened, e.g. after room edits: say so once. */
function useEntryWarning() {
  const blocked = useBlockedIds();
  const project = useProjectStore((s) => s.project);
  const first = useRef({ blocked, project });
  useEffect(() => {
    const ids = [...first.current.blocked].filter((id) => first.current.project.modules.some((m) => m.id === id) || first.current.project.appliances.some((a) => a.id === id));
    if (ids.length) {
      toast.warning(`${ids.length} unit${ids.length === 1 ? "" : "s"} no longer fit${ids.length === 1 ? "s" : ""} after room changes`, {
        id: "design-entry-blocked",
        description: "They're outlined in red. Open the checks in the footer to see why.",
      });
    }
  }, []);
}

/** Arrow keys nudge the selected unit (fast check while held, full check on release), Delete removes, Esc deselects. */
function useKeyboard() {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const { project, ui, removePlacement, select } = projectStore.getState();
      const interaction = useInteraction.getState();
      if (e.key === "Escape") {
        select(null);
        interaction.set({ outcome: null, ghost: null, item: null });
        return;
      }
      const p = project.modules.find((m) => m.id === ui.selectedPlacementId);
      if (!p) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removePlacement(p.id);
        interaction.set({ outcome: null });
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const step = (e.shiftKey ? 100 : 10) * (e.key === "ArrowLeft" ? -1 : 1);
      const current = interaction.ghost?.item.kind === "nudge" && interaction.ghost.candidate.id === p.id ? interaction.ghost.candidate.offsetMm : p.offsetMm;
      const ghost = ghostAt(project, { kind: "nudge", placementId: p.id }, p, current + step);
      interaction.set({ item: ghost.item, ghost, outcome: null });
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const { ghost, elevation, set } = useInteraction.getState();
      if (ghost?.item.kind !== "nudge") return;
      set({ ghost: null, item: null });
      const c = ghost.candidate;
      const at =
        elevation && elevation.wallId === c.wallId
          ? elevation.locate(c.offsetMm + c.widthMm / 2, 0)
          : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      commitGhost(ghost, at);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);
}

export function DesignScreen() {
  const room = useRoomValidation();
  const item = useInteraction((s) => s.item);
  const overWall = useInteraction((s) => s.ghost !== null && s.item?.kind === "new");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  useEntryWarning();
  useKeyboard();

  if (!room.ok) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-mk-canvas text-center">
        <p className="text-[15px] font-medium">Finish the room before designing</p>
        <p className="max-w-md text-[13px] text-mk-muted">{room.issues[0]?.message}</p>
        <Button render={<Link href="/setup" />} variant="outline">
          Back to Room Setup
        </Button>
      </div>
    );
  }

  const onDragStart = (e: DragStartEvent) => {
    const moduleCode = e.active.data.current?.moduleCode as string | undefined;
    if (!moduleCode) return;
    const { ui, project, showWall } = projectStore.getState();
    // Units are dropped onto an elevation: open one if the plan is showing.
    if (ui.designTab === "plan") showWall(ui.activeWallId ?? project.room.walls[0].id);
    useInteraction.getState().set({ item: { kind: "new", moduleCode }, ghost: null, outcome: null });
  };
  const onDragMove = (e: DragMoveEvent) => useInteraction.getState().set({ pointer: pointerOf(e) });
  const onDragEnd = (e: DragEndEvent) => {
    const { item: dragged, elevation, set } = useInteraction.getState();
    const pointer = pointerOf(e);
    set({ item: null, ghost: null, pointer: null });
    if (dragged?.kind !== "new" || !pointer || !elevation) return;
    const ghost = elevation.resolve(pointer, dragged, !(e.activatorEvent as PointerEvent).altKey);
    if (ghost) commitGhost(ghost, pointer);
  };

  const draggedModule = item?.kind === "new" ? getModule(catalogue, item.moduleCode) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => useInteraction.getState().set({ item: null, ghost: null, pointer: null })}
      autoScroll={false}
    >
      <div className="flex min-h-0 flex-1">
        <ModulesPanel />
        <ViewsPanel />
        <ThreePanel />
        <Inspector />
      </div>
      <DesignFooter />
      <DragOverlay dropAnimation={null}>{draggedModule && <ModuleDragPreview moduleCode={draggedModule.code} compact={overWall} />}</DragOverlay>
    </DndContext>
  );
}
