"use client";

import { ArrowRight, Check, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { catalogue, getModule } from "@/domain/catalogue";
import { formatINR } from "@/domain/format";
import { findPlacement, isModulePlacement } from "@/domain/geometry";
import { summarise } from "@/domain/rules";
import type { CheckResult } from "@/domain/types";
import { STATUS_LABELS } from "@/lib/rule-labels";
import { cn } from "@/lib/utils";
import { projectStore, usePricing, useProjectStore, useRawChecks } from "@/store/project-store";
import { useInteraction } from "./interaction";

/** Running total with the change caused by the last edit (including undo). */
function RunningTotal() {
  const project = useProjectStore((s) => s.project);
  const total = usePricing().grandTotal;
  const [track, setTrack] = useState({ project, total, delta: 0 });
  if (track.project !== project) setTrack({ project, total, delta: total - track.total });
  const delta = track.project === project ? track.delta : total - track.total;

  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[13.5px] text-mk-ink-2">Running total</span>
      <Tooltip>
        <TooltipTrigger render={<span className="num text-[26px] font-semibold tracking-tight" data-running-total />}>{formatINR(total)}</TooltipTrigger>
        <TooltipContent>Including 18% GST</TooltipContent>
      </Tooltip>
      <span
        key={`${delta}-${track.total}`}
        data-delta
        className={cn(
          "num animate-in rounded-md px-2 py-0.5 text-[12.5px] fade-in-0 zoom-in-95",
          delta === 0 ? "text-mk-faint" : delta > 0 ? "bg-mk-subtle text-mk-ink" : "bg-mk-ok-soft text-mk-ok",
        )}
      >
        {delta === 0 ? "No change" : `${delta > 0 ? "+" : "−"}${formatINR(Math.abs(delta))}`}
      </span>
    </div>
  );
}

function describe(r: CheckResult) {
  const { project } = projectStore.getState();
  const p = r.placementIds.map((id) => findPlacement(project, id)).find(Boolean);
  const unit = p && isModulePlacement(p) ? `Wall ${p.wallId} · ${p.moduleCode}` : null;
  return unit;
}

function ChecksChip() {
  const raw = useRawChecks();
  const issues = raw.filter((r) => r.status !== "pass");
  const { blocked, warning, approval } = summarise(raw);
  const [open, setOpen] = useState(false);
  const show = (r: CheckResult) => {
    const id = r.placementIds[0];
    if (!id) return;
    const { select, showWall } = projectStore.getState();
    select(id);
    const wall = projectStore.getState().ui.activeWallId;
    if (wall) showWall(wall);
    useInteraction.getState().set({ outcome: null });
    setOpen(false);
  };

  if (!issues.length) {
    return (
      <span className="flex h-[36px] items-center gap-2 rounded-full bg-mk-ok-soft px-4 text-[13.5px] font-medium text-mk-ok" data-checks="ok">
        <Check className="size-4" strokeWidth={2.5} /> All checks passed
      </span>
    );
  }
  const parts = [blocked && `${blocked} blocked`, warning && `${warning} warning${warning === 1 ? "" : "s"}`, approval && `${approval} approval`].filter(Boolean);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-checks={blocked ? "blocked" : "warning"}
            className={cn(
              "flex h-[36px] items-center gap-2 rounded-full px-4 text-[13.5px] font-medium",
              blocked ? "bg-mk-bad-soft text-mk-bad" : "bg-mk-warn-soft text-mk-warn",
            )}
          />
        }
      >
        <span className={cn("size-2 rounded-full", blocked ? "bg-mk-bad" : "bg-mk-warn")} />
        {parts.join(" · ")}
        <ChevronUp className={cn("size-4 transition-transform", !open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[420px] gap-0 p-0">
        <div className="flex items-center justify-between border-b border-mk-line px-4 py-3">
          <span className="text-[14px] font-semibold">Checks</span>
          <span className="text-[12px] text-mk-faint">Updated just now</span>
        </div>
        <ul className="max-h-[320px] overflow-y-auto">
          {issues.map((r, i) => (
            <li key={`${r.ruleId}-${i}`} className="flex gap-3 border-b border-mk-line px-4 py-3 last:border-b-0">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", r.status === "blocked" ? "bg-mk-bad" : r.status === "warning" ? "bg-mk-warn" : "bg-mk-accent")} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug">{r.message}</p>
                <p className="mt-0.5 text-[12px] text-mk-muted">
                  {describe(r) && <>{describe(r)} · </>}
                  <span className={r.status === "blocked" ? "text-mk-bad" : r.status === "warning" ? "text-mk-warn" : "text-mk-accent-ink"}>{STATUS_LABELS[r.status]}</span>
                </p>
              </div>
              {r.placementIds.length > 0 && (
                <button type="button" onClick={() => show(r)} className="self-start text-[12.5px] font-medium text-mk-accent-ink hover:underline">
                  Show
                </button>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function DesignFooter() {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const raw = useRawChecks();
  const blocked = raw.filter((r) => r.status === "blocked");
  const modules = project.modules.filter((m) => getModule(catalogue, m.moduleCode).family !== "FIL").length;
  const appliances = project.appliances.length;

  const review = (
    <Button size="lg" className="h-[46px] gap-2.5 rounded-lg px-6 text-[15px]" disabled={blocked.length > 0} onClick={() => router.push("/quote")}>
      Review Quote <ArrowRight className="size-4" />
    </Button>
  );

  return (
    <footer className="flex h-[72px] shrink-0 items-center justify-between gap-6 border-t border-mk-line bg-mk-panel px-8">
      <div className="flex min-w-0 items-center gap-6">
        <RunningTotal />
        <span className="h-8 w-px bg-mk-line" />
        <span className="text-[14px] whitespace-nowrap text-mk-ink-2">
          <span className="num">{modules}</span> module{modules === 1 ? "" : "s"} · <span className="num">{appliances}</span> appliance{appliances === 1 ? "" : "s"}
        </span>
        <ChecksChip />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Button variant="outline" size="lg" className="h-[46px] rounded-lg px-6 text-[15px]" onClick={() => toast.success("Draft saved")}>
          Save draft
        </Button>
        {blocked.length ? (
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} className="cursor-not-allowed" />}>{review}</TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm">
              Resolve {blocked.length} blocked check{blocked.length === 1 ? "" : "s"} before reviewing the quote.
            </TooltipContent>
          </Tooltip>
        ) : (
          review
        )}
      </div>
    </footer>
  );
}
