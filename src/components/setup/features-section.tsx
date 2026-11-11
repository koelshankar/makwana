"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Feature } from "@/domain/types";
import { FEATURE_TITLES, featureSummary } from "@/lib/room-format";
import { cn } from "@/lib/utils";
import { projectStore, useProjectStore } from "@/store/project-store";
import { FeatureForm } from "./feature-form";
import { SectionHeading } from "./project-section";
import { notifyRecheck } from "./recheck";
import { useSetupUi, type Tool } from "./setup-ui";

/** Circled feature number, shared by the list and the plan. */
export function FeatureNumber({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      className={cn(
        "num flex size-[20px] shrink-0 items-center justify-center rounded-full border text-[10.5px]",
        active ? "border-mk-accent bg-mk-accent text-white" : "border-mk-ink-2 text-mk-ink",
      )}
    >
      {n}
    </span>
  );
}

function featureWalls(f: Feature): string[] | undefined {
  return "wallId" in f ? [f.wallId] : undefined;
}

export function saveFeature(next: Feature) {
  projectStore.getState().updateFeature(next.id, next);
  notifyRecheck(featureWalls(next));
}

export function removeFeature(f: Feature) {
  projectStore.getState().removeFeature(f.id);
  useSetupUi.getState().selectFeature(null);
  toast(`${FEATURE_TITLES[f.kind]} removed`, { action: { label: "Undo", onClick: () => projectStore.getState().undo() } });
  notifyRecheck(featureWalls(f));
}

function FeatureRow({ feature, n }: { feature: Feature; n: number }) {
  const room = useProjectStore((s) => s.project.room);
  const selected = useSetupUi((s) => s.selectedFeatureId === feature.id);
  const editing = useSetupUi((s) => s.editingFeatureId === feature.id);
  const { selectFeature, editFeature } = useSetupUi.getState();

  return (
    <div
      onClick={() => selectFeature(feature.id)}
      className={cn(
        "group flex h-[31px] items-center gap-2.5 border-b border-mk-line px-3 last:border-b-0",
        selected ? "bg-mk-accent-soft" : "hover:bg-mk-canvas",
      )}
    >
      <FeatureNumber n={n} active={selected} />
      <span className="w-[72px] shrink-0 text-[13px] font-medium">{FEATURE_TITLES[feature.kind]}</span>
      <span className="num min-w-0 flex-1 truncate text-[11.5px] tracking-[-0.02em] text-mk-muted">{featureSummary(room, feature)}</span>
      <Popover open={editing} onOpenChange={(open) => editFeature(open ? feature.id : null)}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={`Edit ${FEATURE_TITLES[feature.kind]}`}
              className="text-mk-faint hover:text-mk-ink"
              onClick={(e) => e.stopPropagation()}
            />
          }
        >
          <Pencil className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-80 p-3.5">
          <FeatureForm
            key={feature.id}
            feature={feature}
            onCancel={() => editFeature(null)}
            onSave={(next) => {
              saveFeature(next);
              editFeature(null);
            }}
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={`Delete ${FEATURE_TITLES[feature.kind]}`}
        onClick={(e) => {
          e.stopPropagation();
          removeFeature(feature);
        }}
        className="text-mk-faint opacity-60 group-hover:opacity-100 hover:text-mk-bad"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

const ADD_ITEMS: { label: string; tool?: Tool; opening?: "window" | "door"; hint?: string }[] = [
  { label: "Window", tool: "opening", opening: "window", hint: "Click a wall on the plan to place the window." },
  { label: "Door", tool: "opening", opening: "door", hint: "Click a wall on the plan to place the door." },
  { label: "Plumbing point", tool: "plumbing", hint: "Click a wall on the plan to place the plumbing point." },
  { label: "Column", tool: "column", hint: "Click inside the room to place a 300 × 300 column." },
  { label: "Beam", tool: "beam", hint: "Click the wall the beam runs along." },
  { label: "Duct box" },
];

export function addDuctBox() {
  const id = projectStore.getState().addFeature({ kind: "ductBox", label: "Duct box" });
  useSetupUi.getState().editFeature(id);
}

export function FeaturesSection() {
  const features = useProjectStore((s) => s.project.room.features);
  const setTool = useSetupUi((s) => s.setTool);

  return (
    <section>
      <SectionHeading
        action={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-[31px] gap-1.5 px-3 text-[13px]" />}>
              <Plus className="size-3.5" /> Add feature
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {ADD_ITEMS.map((item) => (
                <DropdownMenuItem
                  key={item.label}
                  onClick={() => {
                    if (!item.tool) return addDuctBox();
                    setTool(item.tool, item.opening);
                    if (item.hint) toast(item.hint);
                  }}
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        Room features
      </SectionHeading>
      {features.length ? (
        <div className="overflow-hidden rounded-lg border border-mk-line">
          {features.map((f, i) => (
            <FeatureRow key={f.id} feature={f} n={i + 1} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-mk-line px-3 py-3 text-[12.5px] text-mk-faint">
          Windows, doors, plumbing, columns, beams and duct boxes go here.
        </p>
      )}
    </section>
  );
}
