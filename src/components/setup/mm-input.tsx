"use client";

import { cn } from "@/lib/utils";

interface MmInputProps {
  value: number;
  /** Called on blur or Enter with a valid integer that differs from `value`. */
  onCommit: (mm: number) => void;
  min?: number;
  max?: number;
  className?: string;
  "aria-label"?: string;
  autoFocus?: boolean;
  size?: "sm" | "md";
}

/** Typed millimetre input in Geist Mono with an "mm" suffix. Commits on blur/Enter, Esc reverts. */
export function MmInput({ value, onCommit, min = 1, max = 100000, className, autoFocus, size = "md", ...rest }: MmInputProps) {
  const commit = (el: HTMLInputElement) => {
    const n = Math.round(Number(el.value));
    if (!Number.isFinite(n) || el.value.trim() === "" || n < min || n > max) {
      el.value = String(value);
      return;
    }
    el.value = String(n);
    if (n !== value) onCommit(n);
  };
  return (
    <label
      className={cn(
        "flex items-center rounded-md border border-mk-line bg-mk-panel pr-2 transition-colors focus-within:border-mk-accent focus-within:ring-2 focus-within:ring-mk-accent/20",
        size === "sm" ? "h-[26px]" : "h-[31px]",
        className,
      )}
    >
      <input
        key={value}
        defaultValue={value}
        inputMode="numeric"
        autoFocus={autoFocus}
        aria-label={rest["aria-label"]}
        className={cn("num h-full w-full min-w-0 bg-transparent text-mk-ink outline-none", size === "sm" ? "pl-2 text-[13px]" : "pl-3 text-[14px]")}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.value = String(value);
            e.currentTarget.blur();
          }
        }}
      />
      <span className="num pl-1 text-[10.5px] text-mk-faint">mm</span>
    </label>
  );
}
