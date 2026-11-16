"use client";

import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getModule, catalogue } from "@/domain/catalogue";
import { findPlacement, isModulePlacement, solidWalls } from "@/domain/geometry";
import { projectStore, useBlockedIds, useProjectStore, useRoomValidation } from "@/store/project-store";
import { nextWall } from "@/domain/turn";
import { commitGhost, turnSelected } from "./commit";
import { DesignFooter } from "./design-footer";
import { dragPlacement, ghostAt, labelOf, widthOf } from "./ghost";
import { Inspector } from "./inspector";
import { useInteraction, type ClientPoint } from "./interaction";
import { ApplianceDragPreview, ModuleDragPreview, ModulesPanel } from "./modules-panel";
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
      // The customer view only has view controls; Esc leaves it.
      if (ui.customerView) {
        if (e.key === "Escape") projectStore.getState().setCustomerView(false);
        return;
      }
      if (e.key === "Escape") {
        select(null);
        interaction.set({ outcome: null, ghost: null, item: null });
        return;
      }
      const selected = ui.selectedPlacementId ? findPlacement(project, ui.selectedPlacementId) : undefined;
      // R / Shift+R: face the next / previous wall. While dragging, the wall the unit will go on
      // (the elevation switches to it, preview included); otherwise the selected unit turns.
      if (e.code === "KeyR" || e.key === "r" || e.key === "R") {
        if (e.repeat) return;
        const dir = e.shiftKey ? -1 : 1;
        const item = interaction.item;
        if (item && item.kind !== "nudge") {
          e.preventDefault();
          const from = ui.activeWallId ?? solidWalls(project.room)[0]?.id;
          const base = from ? dragPlacement(project, item, from) : null;
          if (!base || !from) return;
          const next = nextWall(project, catalogue, base, from, dir);
          if (next) projectStore.getState().showWall(next);
          else toast(`No other wall fits ${labelOf(base)} (${widthOf(base)} mm)`, { id: "turn-no-wall" });
          return;
        }
        if (selected) {
          e.preventDefault();
          turnSelected(selected.id, dir);
        }
        return;
      }
      if (!selected) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removePlacement(selected.id);
        interaction.set({ outcome: null });
        return;
      }
      // Units and free appliances nudge; fitted appliances move with their host.
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!isModulePlacement(selected) && selected.kind !== "free") return;
      const p = selected;
      e.preventDefault();
      const step = (e.shiftKey ? 100 : 10) * (e.key === "ArrowLeft" ? -1 : 1);
      const nudging = interaction.ghost?.item.kind === "nudge" && interaction.ghost.candidate.id === p.id ? interaction.ghost : null;
      const current = nudging ? nudging.slot.offsetMm : p.offsetMm;
      const ghost = ghostAt(project, { kind: "nudge", placementId: p.id }, p, current + step);
      interaction.set({ item: ghost.item, ghost, outcome: null });
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const { ghost, elevation, set } = useInteraction.getState();
      if (ghost?.item.kind !== "nudge") return;
      set({ ghost: null, item: null });
      const c = ghost.slot;
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
  const overWall = useInteraction((s) => s.ghost !== null && (s.item?.kind === "new" || s.item?.kind === "newAppliance"));
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
    const applianceId = e.active.data.current?.applianceId as string | undefined;
    if (!moduleCode && !applianceId) return;
    const { ui, project, showWall } = projectStore.getState();
    // Units are dropped onto an elevation: open one if the plan is showing.
    if (ui.designTab === "plan") showWall(ui.activeWallId ?? solidWalls(project.room)[0].id);
    useInteraction.getState().set({
      item: moduleCode ? { kind: "new", moduleCode } : { kind: "newAppliance", applianceId: applianceId! },
      ghost: null,
      outcome: null,
      highlight: null,
    });
  };
  const onDragMove = (e: DragMoveEvent) => useInteraction.getState().set({ pointer: pointerOf(e) });
  const onDragEnd = (e: DragEndEvent) => {
    const { item: dragged, elevation, set } = useInteraction.getState();
    const pointer = pointerOf(e);
    set({ item: null, ghost: null, pointer: null });
    if ((dragged?.kind !== "new" && dragged?.kind !== "newAppliance") || !pointer || !elevation) return;
    const ghost = elevation.resolve(pointer, dragged, !(e.activatorEvent as PointerEvent).altKey);
    if (ghost) commitGhost(ghost, pointer);
  };

  const draggedModule = item?.kind === "new" ? getModule(catalogue, item.moduleCode) : null;
  const draggedAppliance = item?.kind === "newAppliance" ? item.applianceId : null;

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
      <DragOverlay dropAnimation={null}>
        {draggedModule && <ModuleDragPreview moduleCode={draggedModule.code} compact={overWall} />}
        {draggedAppliance && <ApplianceDragPreview applianceId={draggedAppliance} compact={overWall} />}
      </DragOverlay>
    </DndContext>
  );
}
