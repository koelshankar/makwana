"use client";

import { Expand, Minus, MoveHorizontal, PenLine, Plus, SquareDashed, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { projectStore, useProjectStore } from "@/store/project-store";
import { FullViewButton } from "@/components/shell/full-view";
import { addDuctBox } from "../features-section";
import { useSetupUi, type Tool } from "../setup-ui";

const HINTS: Partial<Record<Tool, string>> = {
  drawWall: "Add walls in the panel: pick a direction, type a length",
  opening: "Click a wall to add an opening",
  plumbing: "Click a wall to add a plumbing point",
  column: "Click inside the room to place a column · snaps to walls within 150 mm",
  beam: "Click the wall the beam runs along",
};

function ToolButton({ active, onClick, children, label }: { active?: boolean; onClick?: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-[34px] items-center gap-2 rounded-lg px-3.5 text-[13.5px] font-medium whitespace-nowrap transition-colors",
        active ? "bg-mk-ink text-white" : "text-mk-ink hover:bg-mk-subtle",
      )}
    >
      {children}
    </button>
  );
}

export function PlanToolbar({ fullView }: { fullView: { on: boolean; toggle: () => void } }) {
  const tool = useSetupUi((s) => s.tool);
  const setTool = useSetupUi((s) => s.setTool);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const toggle = (t: Tool) => setTool(tool === t ? "select" : t);

  return (
    <div className="relative z-10 flex justify-center pt-3">
      <div className="flex items-center gap-0.5 rounded-xl border border-mk-line bg-mk-panel p-1 shadow-[0_2px_8px_rgba(28,27,25,0.06)]">
        <ToolButton active={tool === "drawWall"} onClick={() => toggle("drawWall")}>
          <PenLine className="size-4" /> Draw wall
        </ToolButton>
        <ToolButton active={tool === "opening"} onClick={() => toggle("opening")}>
          <MoveHorizontal className="size-4" /> Add opening
        </ToolButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  "flex h-[34px] items-center gap-2 rounded-lg px-3.5 text-[13.5px] font-medium whitespace-nowrap transition-colors",
                  tool === "column" || tool === "beam" ? "bg-mk-ink text-white" : "text-mk-ink hover:bg-mk-subtle",
                )}
              />
            }
          >
            <SquareDashed className="size-4" /> Column / beam / duct
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-40">
            <DropdownMenuItem onClick={() => setTool("column")}>Column</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTool("beam")}>Beam</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                addDuctBox();
                toast("Duct box added. Set the walls it covers to draw it.");
              }}
            >
              Duct box
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="mx-1.5 h-5 w-px bg-mk-line" />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Undo"
                disabled={!canUndo}
                onClick={() => projectStore.getState().undo()}
                className="flex size-[34px] items-center justify-center rounded-lg text-mk-ink hover:bg-mk-subtle disabled:opacity-35"
              />
            }
          >
            <Undo2 className="size-[18px]" />
          </TooltipTrigger>
          <TooltipContent>Undo (⌘Z)</TooltipContent>
        </Tooltip>
        <FullViewButton on={fullView.on} onToggle={fullView.toggle} className="size-[34px]" />
      </div>
      {HINTS[tool] && (
        <div className="absolute top-[58px] rounded-full bg-mk-ink px-3.5 py-1 text-[12px] whitespace-nowrap text-white">
          {HINTS[tool]} · <span className="text-white/60">Esc to cancel</span>
        </div>
      )}
    </div>
  );
}

export function ZoomControls({ percent, onZoomIn, onZoomOut, onFit }: { percent: number; onZoomIn: () => void; onZoomOut: () => void; onFit: () => void }) {
  const btn = "flex size-[34px] items-center justify-center rounded-lg border border-mk-line bg-mk-panel text-mk-ink hover:bg-mk-subtle";
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Zoom out" className={btn} onClick={onZoomOut}>
        <Minus className="size-4" />
      </button>
      <span className="num w-12 text-center text-[13px] text-mk-ink-2">{percent}%</span>
      <button type="button" aria-label="Zoom in" className={btn} onClick={onZoomIn}>
        <Plus className="size-4" />
      </button>
      <Tooltip>
        <TooltipTrigger render={<button type="button" aria-label="Fit to screen" className={btn} onClick={onFit} />}>
          <Expand className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Fit to screen</TooltipContent>
      </Tooltip>
    </div>
  );
}
