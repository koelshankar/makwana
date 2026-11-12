"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatINR } from "@/domain/format";
import type { QuoteGroup, QuoteModel } from "@/domain/quote";
import type { Layer } from "@/domain/types";
import { cn } from "@/lib/utils";
import { CostTag, sizeText, Swatch } from "./quote-parts";

/** The unit table of one row group. `print` drops the cost-tag column's chips for plain text widths. */
export function UnitTable({ group }: { group: QuoteGroup }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-mk-line text-left text-[10.5px] tracking-[0.1em] text-mk-faint uppercase">
          <th className="w-[64px] py-2 pl-6 font-normal">Unit</th>
          <th className="w-[64px] py-2 font-normal">Wall</th>
          <th className="py-2 font-normal">Description</th>
          <th className="py-2 font-normal">W × H × D</th>
          <th className="py-2 font-normal">Finish</th>
          <th className="py-2 font-normal">Cost tags (sq ft · ₹)</th>
          <th className="py-2 pr-6 text-right font-normal">Amount</th>
        </tr>
      </thead>
      <tbody>
        {group.lines.map((l) => (
          <tr key={l.placementId} className="border-b border-mk-line/70 last:border-b-0" data-quote-line={l.ref}>
            <td className="num py-2.5 pl-6 font-semibold">{l.ref}</td>
            <td className="py-2.5 whitespace-nowrap text-mk-ink-2">{l.wall}</td>
            <td className="py-2.5 pr-4">
              {l.code !== "FIL" && <span className="num mr-1.5 text-[11.5px] text-mk-muted">{l.code}</span>}
              {l.description}
            </td>
            <td className="num py-2.5 pr-3 whitespace-nowrap text-mk-ink-2">{sizeText(l.size)}</td>
            <td className="py-2.5 pr-3">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <Swatch hex={l.finish.hex} />
                {l.finish.short}
              </span>
            </td>
            <td className="py-2.5 pr-4">
              <span className="flex flex-wrap gap-1">
                <CostTag kind="carcass" sqft={l.carcassSqft} cost={l.carcassCost} />
                <CostTag kind="shutter" sqft={l.shutterSqft} cost={l.shutterCost} />
              </span>
            </td>
            <td className="num py-2.5 pr-6 text-right font-medium whitespace-nowrap">{formatINR(l.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Base / Wall / Loft / Tall, collapsible, with counts, cost tags and totals (Mockup 4). */
export function QuoteGroups({ model }: { model: QuoteModel }) {
  const [open, setOpen] = useState<Set<Layer>>(new Set(["base"]));
  const toggle = (g: Layer) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  return (
    <section className="overflow-hidden rounded-2xl border border-mk-line bg-mk-panel" aria-label="Units">
      {model.groups
        .filter((g) => g.count > 0)
        .map((g) => {
          const isOpen = open.has(g.group);
          return (
            <div key={g.group} className="border-b border-mk-line last:border-b-0" data-quote-group={g.group}>
              <button type="button" aria-expanded={isOpen} onClick={() => toggle(g.group)} className="flex w-full items-center gap-3 px-6 py-3.5 text-left hover:bg-mk-canvas/60">
                {isOpen ? <ChevronDown className="size-4 shrink-0 text-mk-ink-2" /> : <ChevronRight className="size-4 shrink-0 text-mk-ink-2" />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-6">
                    <span className="w-14 text-[15.5px] font-semibold">{g.label}</span>
                    <span className="text-[13px] text-mk-muted">
                      {g.count} unit{g.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  {g.note && <span className="mt-0.5 block text-[12px] text-mk-muted">{g.note}</span>}
                  {/* Narrow screens: the group's cost tags on their own line under the name. */}
                  <span className="mt-1.5 flex flex-wrap gap-1.5 min-[1400px]:hidden" data-group-tags="below">
                    <CostTag kind="carcass" sqft={g.carcassSqft} cost={g.carcassCost} />
                    <CostTag kind="shutter" sqft={g.shutterSqft} cost={g.shutterCost} />
                  </span>
                </span>
                <span className="hidden gap-1.5 min-[1400px]:flex">
                  <CostTag kind="carcass" sqft={g.carcassSqft} cost={g.carcassCost} className="h-[26px] px-2 text-[11.5px]" />
                  <CostTag kind="shutter" sqft={g.shutterSqft} cost={g.shutterCost} className="h-[26px] px-2 text-[11.5px]" />
                </span>
                <span className={cn("num w-[104px] text-right text-[15.5px] font-semibold")}>{formatINR(g.amount)}</span>
              </button>
              {isOpen && (
                <div className="border-t border-mk-line">
                  <UnitTable group={g} />
                </div>
              )}
            </div>
          );
        })}
    </section>
  );
}
