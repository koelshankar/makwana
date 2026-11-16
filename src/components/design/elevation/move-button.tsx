"use client";

// The selected unit's Move button in the elevation (Feedback 2, item 3): a list of the walls it
// fits on. The list is wallsUnitFits, the same as R / Shift+R and the inspector's Wall picker, and
// picking a wall goes through turnSelected, so all three give the same result for the same wall.

import { useMemo, useState } from "react";
import { Move } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { catalogue } from "@/domain/catalogue";
import { findWall } from "@/domain/geometry";
import { turnSubject, wallsUnitFits } from "@/domain/turn";
import { useProjectStore } from "@/store/project-store";
import { turnSelected } from "../commit";
import { labelOf } from "../ghost";

export interface MoveButtonProps {
  /** The selected placement (a fitted appliance moves its host). */
  selectedId: string;
  /** The button's right edge and bottom, in the elevation's mm coordinates. */
  right: number;
  bottom: number;
  /** Screen px to elevation mm at the current zoom. */
  px: (n: number) => number;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const stopPointer = { onPointerDown: stop, onPointerMove: stop, onPointerUp: stop, onWheel: stop };

export function MoveButton({ selectedId, right, bottom, px }: MoveButtonProps) {
  const project = useProjectStore((s) => s.project);
  const [open, setOpen] = useState(false);
  const subject = turnSubject(project, selectedId);
  // Only worked out while the list is open: it runs the placement checks along every wall.
  const walls = useMemo(() => (open && subject ? wallsUnitFits(project, catalogue, subject) : []), [open, project, subject]);
  if (!subject) return null;
  const others = walls.filter((w) => w !== subject.wallId);

  const w = px(64);
  const h = px(24);
  const x = right - w;
  const y = bottom - h;
  const icon = px(13);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <g
            aria-label="Move to another wall"
            data-move-button={subject.id}
            className="cursor-pointer outline-none"
            onPointerDown={(e) => e.stopPropagation()}
          />
        }
      >
        <title>Move to another wall · R next wall · Shift+R previous</title>
        <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="var(--mk-accent)" />
        <Move x={x + px(9)} y={y + (h - icon) / 2} width={icon} height={icon} color="white" strokeWidth={2.4} />
        <text x={x + px(27)} y={y + h / 2} dominantBaseline="central" fontSize={px(11.5)} fontWeight={600} fill="white">
          Move
        </text>
      </PopoverTrigger>
      {/* Portalled in the DOM but still inside the elevation svg in React, whose pointer handlers
          (pan, deselect on release) would otherwise get the list's events and drop the selection. */}
      <PopoverContent side="bottom" align="end" sideOffset={6} className="w-60 gap-0 p-1.5" data-move-menu {...stopPointer}>
        <p className="px-2 pt-1 pb-1.5 text-[12px] font-medium text-mk-muted">Move {labelOf(subject)} to</p>
        {others.length === 0 ? (
          <p className="px-2 pb-1.5 text-[13.5px]" data-move-none>
            No other wall has space
          </p>
        ) : (
          <ul className="flex flex-col" aria-label="Walls">
            {walls.map((id) => {
              const current = id === subject.wallId;
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={current}
                    data-move-wall={id}
                    onClick={() => {
                      setOpen(false);
                      turnSelected(selectedId, id);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13.5px] hover:bg-mk-canvas disabled:cursor-default disabled:text-mk-muted disabled:hover:bg-transparent"
                  >
                    <span>Wall {id}</span>
                    <span className="num text-[12px] text-mk-muted">{current ? "Current" : `${findWall(project.room, id)?.lengthMm} mm`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
