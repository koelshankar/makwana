"use client";

import { ArrowRight, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { catalogue, getAppliance, getModule } from "@/domain/catalogue";
import { formatINR } from "@/domain/format";
import { findPlacement, isModulePlacement } from "@/domain/geometry";
import { issueKey, runAllChecks, summarise } from "@/domain/rules";
import type { CheckResult, Project } from "@/domain/types";
import { ANCHOR_RULES, splitMessage, STATUS_LABELS, STATUS_ORDER } from "@/lib/rule-labels";
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
      <span className="text-[13.5px] text-mk-ink-2">
        Running total <span className="text-[12px] text-mk-muted">incl. GST</span>
      </span>
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

/** Sub-line for a check: "Wall A · T600OM", or the anchor's wall and range for gaps and corners. */
function where(r: CheckResult, project: Project): string {
  const a = r.anchor;
  if (ANCHOR_RULES[r.ruleId] && a) return `Wall ${a.wallId} · ${a.offsetMm}–${a.offsetMm + a.widthMm} mm`;
  const p = r.placementIds.map((id) => findPlacement(project, id)).find(Boolean);
  if (!p) return a ? `Wall ${a.wallId}` : "";
  const label = isModulePlacement(p) ? p.moduleCode : getAppliance(catalogue, p.applianceId).name;
  return a ? `Wall ${a.wallId} · ${label}` : label;
}

const rowKey = (r: CheckResult) => `${issueKey(r)}|${r.message}`;
const DOT: Record<CheckResult["status"], string> = { blocked: "bg-mk-bad", approval: "bg-mk-accent", warning: "bg-mk-warn", pass: "bg-mk-ok" };
const INK: Record<CheckResult["status"], string> = { blocked: "text-mk-bad", approval: "text-mk-accent-ink", warning: "text-mk-warn", pass: "text-mk-ok" };

/** Points the views at a check: selects its unit or highlights its gap/corner, opens its wall, frames it in 3D. */
function focus(r: CheckResult) {
  const { project, select, showWall } = projectStore.getState();
  const kind = ANCHOR_RULES[r.ruleId];
  const id = kind ? undefined : r.placementIds.find((x) => findPlacement(project, x));
  select(id ?? null);
  const wallId = r.anchor?.wallId ?? projectStore.getState().ui.activeWallId;
  if (wallId) showWall(wallId);
  const { frameRequest, set } = useInteraction.getState();
  set({
    outcome: null,
    highlight: kind && r.anchor ? { anchor: r.anchor, kind, project } : null,
    frameRequest: { placementIds: id ? [id] : [], anchor: r.anchor, n: (frameRequest?.n ?? 0) + 1 },
  });
}

/**
 * Footer chip and the Checks popover (Mockup 3). The chip counts come from the cheap raw checks;
 * the list, with validated fixes, is computed only while the popover is open.
 */
function ChecksChip() {
  const project = useProjectStore((s) => s.project);
  const customer = useProjectStore((s) => s.ui.customerView);
  const raw = useRawChecks();
  const { blocked, warning, approval } = summarise(raw);
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<{ project: Project; results: CheckResult[] } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Full checks validate every fix, which is the slow path: only when open, once per project version.
  useEffect(() => {
    if (!open || full?.project === project) return;
    const t = setTimeout(() => {
      const results = runAllChecks(project, catalogue)
        .filter((r) => r.status !== "pass")
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
      setFull({ project, results });
    }, 30);
    return () => clearTimeout(t);
  }, [open, project, full]);
  const checking = open && full?.project !== project;
  const results = full?.results ?? [];

  const issues = blocked + warning + approval;
  const parts = [blocked && `${blocked} blocked`, warning && `${warning} warning${warning === 1 ? "" : "s"}`, approval && `${approval} approval${approval === 1 ? "" : "s"}`].filter(Boolean);
  const tone = blocked ? "bad" : warning ? "warn" : approval ? "accent" : "ok";

  return (
    <Popover
      open={open && !customer}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setExpanded(null);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={customer}
            data-checks={blocked ? "blocked" : warning ? "warning" : approval ? "approval" : "ok"}
            className={cn(
              "flex h-[36px] items-center gap-2 rounded-full px-4 text-[13.5px] font-medium whitespace-nowrap",
              tone === "bad" && "bg-mk-bad-soft text-mk-bad",
              tone === "warn" && "bg-mk-warn-soft text-mk-warn",
              tone === "accent" && "bg-mk-accent-soft text-mk-accent-ink",
              tone === "ok" && "bg-mk-ok-soft text-mk-ok",
            )}
          />
        }
      >
        {issues ? <span className={cn("size-2 rounded-full", DOT[blocked ? "blocked" : warning ? "warning" : "approval"])} /> : <Check className="size-4" strokeWidth={2.5} />}
        {issues ? parts.join(" · ") : "All checks passed"}
        <ChevronUp className={cn("size-4 transition-transform", !open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={10} className="w-[440px] gap-0 p-0" data-checks-popover>
        <div className="flex items-center justify-between border-b border-mk-line px-4 py-3">
          <span className="text-[14px] font-semibold">Checks</span>
          <span className="text-[12px] text-mk-faint" data-checks-state={checking ? "checking" : "ready"}>
            {checking ? "Checking…" : "Updated just now"}
          </span>
        </div>
        {checking && !full ? (
          <p className="px-4 py-5 text-[13px] text-mk-muted">Checking the design…</p>
        ) : results.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-5 text-[13px] text-mk-ok">
            <Check className="size-4" strokeWidth={2.5} /> All checks passed
          </p>
        ) : (
          <ul className={cn("max-h-[360px] overflow-y-auto transition-opacity", checking && "opacity-60")}>
            {results.map((r) => {
              const key = rowKey(r);
              const isOpen = expanded === key;
              const { title, detail } = splitMessage(r.message);
              const sub = where(r, project);
              return (
                <li key={key} className="border-b border-mk-line last:border-b-0" data-check-row={r.ruleId} data-status={r.status}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      focus(r);
                      setExpanded(isOpen ? null : key);
                    }}
                    className="flex w-full gap-3 px-4 py-3 text-left hover:bg-mk-canvas"
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[r.status])} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] leading-snug font-medium">{title.replace(/\.$/, "")}</span>
                      <span className="mt-0.5 block text-[12.5px] text-mk-muted">
                        {sub && <>{sub} · </>}
                        <span className={INK[r.status]}>{STATUS_LABELS[r.status]}</span>
                      </span>
                    </span>
                    <ChevronDown className={cn("mt-1 size-4 shrink-0 text-mk-faint transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 pl-9">
                      {detail && <p className="mb-2 text-[12.5px] leading-relaxed text-mk-ink-2">{detail}</p>}
                      {r.fixes.length ? (
                        <div className="flex flex-col gap-1.5">
                          {r.fixes.map((fix) => (
                            <button
                              key={fix.label}
                              type="button"
                              data-fix
                              onClick={() => {
                                projectStore.getState().applyFix(fix);
                                useInteraction.getState().set({ highlight: null, outcome: null });
                                setExpanded(null);
                              }}
                              className="flex h-[34px] items-center justify-between rounded-lg border border-mk-line px-3 text-left text-[12.5px] text-mk-ink hover:border-mk-ink-2"
                            >
                              <span className="truncate">{fix.label}</span>
                              <ArrowRight className="size-3.5 shrink-0" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-mk-faint">No automatic fix. Change the design or the room to resolve it.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
