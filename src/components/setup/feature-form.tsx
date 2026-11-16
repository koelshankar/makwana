"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validateRoom } from "@/domain/room-validation";
import type { Feature } from "@/domain/types";
import { FEATURE_TITLES } from "@/lib/room-format";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project-store";

function NumField({
  label,
  value,
  onChange,
  suffix = "mm",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-mk-muted">{label}</span>
      <span className="flex h-8 items-center rounded-md border border-mk-line pr-2 focus-within:border-mk-accent">
        <input
          value={text}
          inputMode="numeric"
          className="num h-full w-full min-w-0 bg-transparent pl-2.5 text-[14px] outline-none"
          onChange={(e) => {
            setText(e.target.value);
            const n = Math.round(Number(e.target.value));
            if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
          }}
        />
        {suffix && <span className="num text-[11px] text-mk-faint">{suffix}</span>}
      </span>
    </label>
  );
}

function WallField({ label, value, onChange, optional }: { label: string; value: string | undefined; onChange: (id: string | undefined) => void; optional?: boolean }) {
  const allWalls = useProjectStore((s) => s.project.room.walls);
  const walls = useMemo(() => allWalls.filter((w) => !w.open), [allWalls]);
  const items = [...(optional ? [{ value: "", label: "—" }] : []), ...walls.map((w) => ({ value: w.id, label: `Wall ${w.id}` }))];
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-mk-muted">{label}</span>
      <Select items={items} value={value ?? ""} onValueChange={(v) => onChange((v as string) || undefined)}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

interface FeatureFormProps {
  feature: Feature;
  isNew?: boolean;
  /** Lets a new opening switch between window and door. */
  allowOpeningSwitch?: boolean;
  onSave: (feature: Feature) => void;
  onCancel: () => void;
}

/** Edit form for any feature type. Validates against the whole room before saving. */
export function FeatureForm({ feature, isNew, allowOpeningSwitch, onSave, onCancel }: FeatureFormProps) {
  const room = useProjectStore((s) => s.project.room);
  const [draft, setDraft] = useState<Feature>(feature);
  const set = (patch: Partial<Feature>) => setDraft((d) => ({ ...d, ...patch }) as Feature);

  const candidate = {
    ...room,
    features: isNew ? [...room.features, draft] : room.features.map((f) => (f.id === draft.id ? draft : f)),
  };
  const issues = validateRoom(candidate).issues.filter((i) => i.featureId === draft.id);

  const switchKind = (kind: "window" | "door") => {
    if (draft.kind === kind || (draft.kind !== "window" && draft.kind !== "door")) return;
    const base = { id: draft.id, wallId: draft.wallId, offsetMm: draft.offsetMm };
    setDraft(
      kind === "window"
        ? { ...base, kind, widthMm: 900, sillMm: 1050, topMm: 2100 }
        : { ...base, kind, widthMm: 800, heightMm: 2100 },
    );
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!issues.length) onSave(draft);
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold">
          {isNew ? "Add" : "Edit"} {FEATURE_TITLES[draft.kind].toLowerCase()}
        </span>
        {allowOpeningSwitch && (draft.kind === "window" || draft.kind === "door") && (
          <span className="flex rounded-md bg-mk-subtle p-0.5 text-[12px]">
            {(["window", "door"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => switchKind(k)}
                className={cn("rounded px-2 py-0.5 capitalize", draft.kind === k ? "bg-mk-panel shadow-sm" : "text-mk-muted")}
              >
                {k}
              </button>
            ))}
          </span>
        )}
      </div>

      <div key={draft.kind} className="grid grid-cols-2 gap-2.5">
        {draft.kind === "window" && (
          <>
            <WallField label="Wall" value={draft.wallId} onChange={(id) => id && set({ wallId: id })} />
            <NumField label="From left" value={draft.offsetMm} onChange={(n) => set({ offsetMm: n })} />
            <NumField label="Width" value={draft.widthMm} onChange={(n) => set({ widthMm: n })} />
            <NumField label="Sill" value={draft.sillMm} onChange={(n) => set({ sillMm: n })} />
            <NumField label="Top" value={draft.topMm} onChange={(n) => set({ topMm: n })} />
          </>
        )}
        {draft.kind === "door" && (
          <>
            <WallField label="Wall" value={draft.wallId} onChange={(id) => id && set({ wallId: id })} />
            <NumField label="From left" value={draft.offsetMm} onChange={(n) => set({ offsetMm: n })} />
            <NumField label="Width" value={draft.widthMm} onChange={(n) => set({ widthMm: n })} />
            <NumField label="Height" value={draft.heightMm} onChange={(n) => set({ heightMm: n })} />
          </>
        )}
        {draft.kind === "plumbing" && (
          <>
            <WallField label="Wall" value={draft.wallId} onChange={(id) => id && set({ wallId: id })} />
            <NumField label="From left" value={draft.offsetMm} onChange={(n) => set({ offsetMm: n })} />
          </>
        )}
        {draft.kind === "beam" && (
          <>
            <WallField label="Wall" value={draft.wallId} onChange={(id) => id && set({ wallId: id })} />
            <NumField label="Bottom" value={draft.bottomMm} onChange={(n) => set({ bottomMm: n })} />
            <NumField label="Depth" value={draft.depthMm} onChange={(n) => set({ depthMm: n })} />
          </>
        )}
        {draft.kind === "column" && (
          <>
            <NumField label="X" value={draft.x} onChange={(n) => set({ x: n })} />
            <NumField label="Y" value={draft.y} onChange={(n) => set({ y: n })} />
            <NumField label="Width" value={draft.widthMm} onChange={(n) => set({ widthMm: n })} />
            <NumField label="Depth" value={draft.depthMm} onChange={(n) => set({ depthMm: n })} />
          </>
        )}
        {draft.kind === "ductBox" && (
          <>
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-[12px] text-mk-muted">Label</span>
              <input
                value={draft.label}
                onChange={(e) => set({ label: e.target.value })}
                className="h-8 rounded-md border border-mk-line px-2.5 text-[14px] outline-none focus:border-mk-accent"
              />
            </label>
            <WallField label="From wall" optional value={draft.fromWallId} onChange={(id) => set({ fromWallId: id })} />
            <WallField label="To wall" optional value={draft.toWallId} onChange={(id) => set({ toWallId: id })} />
          </>
        )}
      </div>

      {issues.length > 0 && (
        <ul className="rounded-md bg-mk-bad-soft px-2.5 py-1.5 text-[12px] text-mk-bad">
          {issues.map((i) => (
            <li key={i.message}>{i.message}</li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={issues.length > 0}>
          {isNew ? "Add" : "Save"}
        </Button>
      </div>
    </form>
  );
}
