"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, PenLine, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { catalogue, getAppliance } from "@/domain/catalogue";
import { isModulePlacement, isRoomClosed, placementsOnWall } from "@/domain/geometry";
import { closingHint, perpendicularHeadings, roomGaps } from "@/domain/room-validation";
import { emptyMehta } from "@/domain/seed";
import type { Heading, Wall } from "@/domain/types";
import { cn } from "@/lib/utils";
import { HEADING_NAMES, projectStore, useProjectStore, type NewWall } from "@/store/project-store";
import { MmInput } from "./mm-input";
import { SectionHeading } from "./project-section";
import { notifyRecheck } from "./recheck";
import { useSetupUi } from "./setup-ui";

export const HEADING_ICONS: Record<Heading, typeof ArrowUp> = { N: ArrowUp, E: ArrowRight, S: ArrowDown, W: ArrowLeft };

const named = (walls: [Heading, number][]): NewWall[] =>
  walls.map(([heading, lengthMm]) => ({ heading, lengthMm, label: HEADING_NAMES[heading] }));

const TEMPLATES: { name: string; walls: NewWall[] }[] = [
  { name: "Straight", walls: named([["E", 3600], ["S", 2100], ["W", 3600], ["N", 2100]]) },
  { name: "L-shaped", walls: named([["E", 3600], ["S", 1500], ["W", 1200], ["S", 1200], ["W", 2400], ["N", 2700]]) },
  {
    name: "U-shaped",
    walls: named([["E", 3600], ["S", 3000], ["W", 1200], ["N", 1500], ["W", 1200], ["S", 1500], ["W", 1200], ["N", 3000]]),
  },
  { name: "Mehta 8-wall", walls: emptyMehta.room.walls.map(({ heading, lengthMm, label }) => ({ heading, lengthMm, label })) },
];

function WallBadge({ id, selected }: { id: string; selected: boolean }) {
  return (
    <span
      className={cn(
        "num flex size-[22px] shrink-0 items-center justify-center rounded-[5px] border text-[11.5px] font-semibold",
        selected ? "border-mk-accent bg-mk-accent text-white" : "border-mk-line bg-mk-panel text-mk-ink-2",
      )}
    >
      {id}
    </span>
  );
}

/** A deleted wall's place: open, with its letter, heading and length kept; a wall can be drawn back in. */
function OpenWallRow({ wall }: { wall: Wall }) {
  const selected = useSetupUi((s) => s.selectedWallId === wall.id);
  const selectWall = useSetupUi((s) => s.selectWall);
  const Icon = HEADING_ICONS[wall.heading];
  return (
    <div
      onClick={() => selectWall(wall.id)}
      data-open-wall={wall.id}
      className={cn("flex h-[29px] items-center gap-2.5 border-b border-mk-line px-2.5 last:border-b-0", selected ? "bg-mk-accent-soft" : "bg-mk-warn-soft/40 hover:bg-mk-canvas")}
    >
      <span className="num flex size-[22px] shrink-0 items-center justify-center rounded-[5px] border border-dashed border-mk-warn text-[11.5px] font-semibold text-mk-warn">{wall.id}</span>
      <Icon className="size-3.5 shrink-0 text-mk-faint" strokeWidth={2} aria-label={HEADING_NAMES[wall.heading]} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-mk-warn">Open</span>
      <span className="num w-[100px] pr-2 text-right text-[12.5px] text-mk-ink-2">{wall.lengthMm} mm</span>
      <button
        type="button"
        aria-label={`Draw wall ${wall.id}`}
        onClick={(e) => {
          e.stopPropagation();
          projectStore.getState().fillGap(wall.id);
          notifyRecheck([wall.id]);
        }}
        className="flex h-[22px] shrink-0 items-center gap-1 rounded-md border border-mk-line bg-mk-panel px-1.5 text-[11.5px] font-medium text-mk-ink hover:border-mk-accent"
      >
        <PenLine className="size-3" /> Draw wall
      </button>
    </div>
  );
}

function WallRow({ wall }: { wall: Wall }) {
  const selected = useSetupUi((s) => s.selectedWallId === wall.id);
  const selectWall = useSetupUi((s) => s.selectWall);
  const updateWall = useProjectStore((s) => s.updateWall);
  const Icon = HEADING_ICONS[wall.heading];
  const label = wall.label ?? HEADING_NAMES[wall.heading];

  const [confirming, setConfirming] = useState(false);
  const project = useProjectStore((s) => s.project);
  const units = useMemo(() => placementsOnWall(project, wall.id), [project, wall.id]);
  const remove = () => {
    projectStore.getState().removeWall(wall.id);
    setConfirming(false);
    const extra = units.length ? ` with ${units.length} unit${units.length === 1 ? "" : "s"}` : "";
    toast(`Wall ${wall.id} removed${extra} · the room is open there`, { action: { label: "Undo", onClick: () => projectStore.getState().undo() } });
  };

  return (
    <div
      onClick={() => selectWall(wall.id)}
      className={cn(
        "group flex h-[29px] items-center gap-2.5 border-b border-mk-line px-2.5 last:border-b-0",
        selected ? "bg-mk-accent-soft" : "hover:bg-mk-canvas",
      )}
    >
      <WallBadge id={wall.id} selected={selected} />
      <Icon className="size-3.5 shrink-0 text-mk-accent-ink" strokeWidth={2} aria-label={HEADING_NAMES[wall.heading]} />
      <input
        key={label}
        defaultValue={label}
        aria-label={`Wall ${wall.id} label`}
        className="min-w-0 flex-1 truncate bg-transparent text-[13px] text-mk-ink-2 outline-none focus:text-mk-ink"
        onBlur={(e) => e.currentTarget.value !== label && updateWall(wall.id, { label: e.currentTarget.value })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <MmInput
        size="sm"
        className={cn("h-[24px] w-[100px]", selected && "border-mk-accent")}
        value={wall.lengthMm}
        aria-label={`Wall ${wall.id} length`}
        onCommit={(n) => {
          updateWall(wall.id, { lengthMm: n });
          notifyRecheck([wall.id]);
        }}
      />
      <button
        type="button"
        aria-label={`Delete wall ${wall.id}`}
        onClick={(e) => {
          e.stopPropagation();
          if (units.length) setConfirming(true);
          else remove();
        }}
        className="text-mk-faint opacity-60 transition-opacity group-hover:opacity-100 hover:text-mk-bad"
      >
        <Trash2 className="size-3.5" />
      </button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Wall {wall.id}?</DialogTitle>
            <DialogDescription>
              {units.length} unit{units.length === 1 ? "" : "s"} on Wall {wall.id} will be removed. The other walls stay where they are and the room is left open there. You can undo this.
            </DialogDescription>
          </DialogHeader>
          <ul className="num flex flex-wrap gap-1.5 text-[12px]">
            {units.map((u) => (
              <li key={u.id} className="rounded bg-mk-subtle px-1.5 py-0.5 text-mk-ink-2">
                {isModulePlacement(u) ? u.moduleCode : getAppliance(catalogue, u.applianceId).name}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete wall and units
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddWallFlow() {
  const walls = useProjectStore((s) => s.project.room.walls);
  const highlight = useSetupUi((s) => s.tool === "drawWall");
  const setAddingWall = useSetupUi((s) => s.setAddingWall);
  const selectWall = useSetupUi((s) => s.selectWall);
  const last = walls[walls.length - 1];
  const allowed = perpendicularHeadings(last?.heading);
  const [heading, setHeading] = useState<Heading | null>(null);
  const [length, setLength] = useState(1200);
  const chosen = heading && allowed.includes(heading) ? heading : null;

  const add = () => {
    if (!chosen) return;
    const id = projectStore.getState().addWall({ heading: chosen, lengthMm: length, label: HEADING_NAMES[chosen] });
    selectWall(id);
    setHeading(null);
  };

  return (
    <div
      className={cn(
        "mt-2.5 rounded-lg border border-mk-line bg-mk-canvas p-2.5",
        highlight && "border-mk-accent ring-2 ring-mk-accent/25",
      )}
    >
      <div className="mb-2 text-[12px] text-mk-muted">
        Wall {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !walls.some((w) => w.id === l))} · pick a direction{last ? ` (turning off Wall ${last.id})` : ""} and type its length
      </div>
      <div className="flex items-center gap-1.5">
        {(["N", "E", "S", "W"] as Heading[]).map((h) => {
          const Icon = HEADING_ICONS[h];
          const enabled = allowed.includes(h);
          return (
            <button
              key={h}
              type="button"
              disabled={!enabled}
              aria-label={HEADING_NAMES[h]}
              aria-pressed={chosen === h}
              onClick={() => setHeading(h)}
              className={cn(
                "flex size-[30px] items-center justify-center rounded-md border transition-colors",
                chosen === h
                  ? "border-mk-accent bg-mk-accent text-white"
                  : "border-mk-line bg-mk-panel text-mk-accent-ink hover:border-mk-accent",
                !enabled && "cursor-not-allowed opacity-30 hover:border-mk-line",
              )}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
        <MmInput className="ml-1 w-[104px]" value={length} aria-label="New wall length" onCommit={setLength} />
        <Button size="sm" className="h-[31px] px-3" disabled={!chosen} onClick={add}>
          Add
        </Button>
        <Button size="sm" variant="ghost" className="h-[31px] px-2" onClick={() => setAddingWall(false)}>
          Done
        </Button>
      </div>
    </div>
  );
}

function RoomStatus() {
  const room = useProjectStore((s) => s.project.room);
  const closeRoom = useProjectStore((s) => s.closeRoom);
  if (room.walls.length === 0) return <span className="text-[13px] text-mk-faint">No walls yet</span>;
  if (isRoomClosed(room)) {
    return (
      <span className="flex items-center gap-2 text-[13px] text-mk-ok">
        <span className="size-2 rounded-full bg-mk-ok" />
        Room closed · {room.walls.length} walls
      </span>
    );
  }
  const gaps = roomGaps(room);
  const hint = closingHint(room);
  // Close room fills the gaps, and adds the closing walls when the end is open and they fit.
  const canClose = gaps.length > 0 || !!hint?.valid;
  const parts = [
    gaps.length === 1 ? `Open at ${gaps[0].wallId} · ${gaps[0].lengthMm} mm` : gaps.length > 1 ? `Open at ${gaps.map((g) => g.wallId).join(", ")}` : null,
    hint ? `Open by ${hint.summary}` : null,
  ].filter(Boolean);
  const button = (
    <Button size="sm" variant="outline" className="h-7 border-mk-warn/50 text-mk-ink" disabled={!canClose} onClick={() => {
        closeRoom();
        notifyRecheck();
      }}>
      Close room
    </Button>
  );
  return (
    <span className="flex items-center gap-2.5 text-[13px] whitespace-nowrap text-mk-warn">
      <span className="size-2 rounded-full bg-mk-warn" />
      <span className="num text-[12px]" data-room-open>{parts.join(" · ")}</span>
      {canClose ? (
        button
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span />}>{button}</TooltipTrigger>
          <TooltipContent>Closing from here would double back on a wall. Adjust the last wall first.</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

export function WallsSection() {
  const walls = useProjectStore((s) => s.project.room.walls);
  const addingWall = useSetupUi((s) => s.addingWall);
  const setAddingWall = useSetupUi((s) => s.setAddingWall);
  const [pending, setPending] = useState<(typeof TEMPLATES)[number] | null>(null);

  const apply = (t: (typeof TEMPLATES)[number]) => {
    projectStore.getState().replaceWalls(t.walls);
    useSetupUi.getState().selectWall("A");
    toast.success(`${t.name} template applied`, { action: { label: "Undo", onClick: () => projectStore.getState().undo() } });
    notifyRecheck();
  };

  return (
    <section>
      <SectionHeading
        action={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<button type="button" className="text-[12.5px] text-mk-ink-2 underline decoration-mk-line underline-offset-4 hover:decoration-mk-ink-2" />}
            >
              Start from a template <span className="text-mk-faint">(optional)</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {TEMPLATES.map((t) => (
                <DropdownMenuItem key={t.name} onClick={() => (walls.length ? setPending(t) : apply(t))}>
                  {t.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        Walls
      </SectionHeading>

      {walls.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-mk-line">
          {walls.map((w) => (w.open ? <OpenWallRow key={w.id} wall={w} /> : <WallRow key={w.id} wall={w} />))}
        </div>
      )}

      {addingWall ? (
        <AddWallFlow />
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" className="h-[31px] gap-1.5 px-3 text-[13px]" onClick={() => setAddingWall(true)}>
            <Plus className="size-3.5" /> Add wall
          </Button>
          <RoomStatus />
        </div>
      )}
      {addingWall && (
        <div className="mt-2 flex justify-end">
          <RoomStatus />
        </div>
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace the walls?</DialogTitle>
            <DialogDescription>
              The {pending?.name} template replaces all {walls.length} walls. Features stay where they are and are re-checked against the new walls.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pending) apply(pending);
                setPending(null);
              }}
            >
              Replace walls
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function CeilingRow() {
  const ceiling = useProjectStore((s) => s.project.room.ceilingHeightMm);
  const setCeiling = useProjectStore((s) => s.setCeiling);
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13.5px] text-mk-ink-2">Ceiling height</span>
      <MmInput
        className="w-[150px]"
        value={ceiling}
        aria-label="Ceiling height"
        onCommit={(n) => {
          setCeiling(n);
          notifyRecheck();
        }}
      />
    </div>
  );
}
