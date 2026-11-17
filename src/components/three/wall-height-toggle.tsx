"use client";

import type { WallHeightMode } from "@/domain/three-model";
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-lg bg-mk-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-md px-2.5 text-[12px] font-medium whitespace-nowrap text-mk-ink-2 transition-colors",
            value === o.value ? "bg-mk-panel text-mk-ink shadow-[0_1px_2px_rgba(28,27,25,0.08)]" : "hover:text-mk-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const HEIGHT_OPTIONS: { value: WallHeightMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "cut", label: "Cut at 450" },
  { value: "full", label: "Full height" },
];

/** Auto (hide the walls in front), Cut at 450, Full height. */
export function WallHeightToggle({ value, onChange }: { value: WallHeightMode; onChange: (v: WallHeightMode) => void }) {
  return <Segmented label="Wall height" value={value} options={HEIGHT_OPTIONS} onChange={onChange} />;
}
