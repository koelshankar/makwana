"use client";

import { ChevronDown, ChevronRight, History } from "lucide-react";
import { useState } from "react";
import { formatINR, parseDiscountInput } from "@/domain/format";
import { formatDate, type QuoteItem, type QuoteModel } from "@/domain/quote";
import type { ActivityEntry } from "@/domain/types";
import { cn } from "@/lib/utils";
import { projectStore } from "@/store/project-store";
import { IncludedBadge } from "./quote-parts";

function ItemCard({ title, total, items, testId, showQty }: { title: string; total: number; items: QuoteItem[]; testId: string; showQty: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="self-start overflow-hidden rounded-2xl border border-mk-line bg-mk-panel" data-quote-card={testId}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 border-b border-mk-line px-5 py-3.5 text-left">
        {open ? <ChevronDown className="size-4 text-mk-ink-2" /> : <ChevronRight className="size-4 text-mk-ink-2" />}
        <span className="flex-1 text-[15px] font-semibold">{title}</span>
        <span className="num text-[15px] font-semibold">{formatINR(total)}</span>
      </button>
      {open && (
        <ul>
          {items.map((it, i) => (
            <li key={`${it.name}-${it.sub}-${i}`} className="flex items-center gap-3 border-b border-mk-line/70 px-5 py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[13.5px]">{it.name}</span>
                {it.sub && <span className="mt-0.5 block text-[12px] text-mk-muted">{it.sub}</span>}
              </span>
              {showQty && <span className="num text-[12px] text-mk-muted">×{it.qty}</span>}
              {it.included && <IncludedBadge />}
              {it.customerOwn && <span className="rounded-[4px] bg-[#e7effc] px-1.5 py-0.5 text-[10.5px] text-[#2a5bb8]">Customer&apos;s own</span>}
              <span className={cn("num w-[72px] text-right text-[13.5px]", (it.included || it.customerOwn) && "text-mk-muted")}>{formatINR(it.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function HardwareCard({ model }: { model: QuoteModel }) {
  return <ItemCard title="Hardware & Accessories" total={model.hardware.total} items={model.hardware.items} testId="hardware" showQty />;
}

export function AppliancesCard({ model }: { model: QuoteModel }) {
  return <ItemCard title="Appliances & Countertop" total={model.appliances.total} items={model.appliances.items} testId="appliances" showQty={false} />;
}

/** Discount input: commits on Enter or blur; the store logs the change. */
function DiscountInput({ value }: { value: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    // Empty or not a number keeps the old value (an empty field used to mean 0%).
    const n = parseDiscountInput(draft);
    if (n !== null) projectStore.getState().setDiscount(n);
    setDraft(null);
  };
  return (
    <label className="inline-flex h-[28px] items-center rounded-md border border-mk-line bg-mk-panel px-1.5 focus-within:border-mk-accent focus-within:ring-2 focus-within:ring-mk-accent/20">
      <input
        aria-label="Discount percent"
        inputMode="decimal"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(null);
        }}
        className="num w-[34px] bg-transparent text-right text-[13px] outline-none"
      />
      <span className="num text-[13px] text-mk-muted">%</span>
    </label>
  );
}

export function TotalsCard({ model, editable }: { model: QuoteModel; editable: boolean }) {
  const t = model.totals;
  const row = (label: React.ReactNode, value: string, extra?: string) => (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[14px] text-mk-ink-2">{label}</span>
      <span className={cn("num text-[14px]", extra)}>{value}</span>
    </div>
  );
  return (
    <section className="self-start rounded-2xl border border-mk-line bg-mk-panel px-5 py-4" data-quote-card="totals">
      {row("Subtotal", formatINR(t.subtotal))}
      <div className="flex items-start justify-between gap-3 py-1.5">
        <span className="leading-tight">
          <span className="flex items-center gap-2 text-[14px] text-mk-ink-2">
            Discount {editable ? <DiscountInput value={t.discountPct} /> : <span className="num">{t.discountPct}%</span>}
          </span>
          <span className={cn("mt-1 block text-[12px]", t.withinLimit ? "text-mk-muted" : "font-medium text-[#2a5bb8]")} data-discount-note>
            {t.withinLimit ? "within salesperson limit" : `above ${t.discountLimitPct}% · needs approval`}
          </span>
        </span>
        <span className="num text-[14px] whitespace-nowrap">{t.discount ? `−${formatINR(t.discount)}` : formatINR(0)}</span>
      </div>
      {row("Taxable value", formatINR(t.taxableValue))}
      {row(`GST ${t.gstPct}%`, formatINR(t.gst))}
      <div className="mt-2 flex items-baseline justify-between border-t border-mk-ink pt-3">
        <span className="text-[15px] font-semibold">Grand total</span>
        <span className="num text-[21px] font-semibold tracking-tight" data-quote-grand-total>
          {formatINR(t.grandTotal)}
        </span>
      </div>
    </section>
  );
}

const time = (iso: string) => {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${formatDate(iso)}, ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
};

export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-2xl border border-mk-line bg-mk-panel" data-activity-log>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left">
        {open ? <ChevronDown className="size-4 text-mk-ink-2" /> : <ChevronRight className="size-4 text-mk-ink-2" />}
        <History className="size-4 text-mk-ink-2" />
        <span className="flex-1 text-[15px] font-semibold">Activity</span>
        <span className="text-[12.5px] text-mk-muted">
          {entries.length} entr{entries.length === 1 ? "y" : "ies"}
        </span>
      </button>
      {open && !entries.length && (
        <p className="border-t border-mk-line px-5 py-3 text-[13px] text-mk-muted">Nothing yet. Discount changes, approvals and sharing are logged here.</p>
      )}
      {open && entries.length > 0 && (
        <ol className="border-t border-mk-line">
          {[...entries].reverse().map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-4 border-b border-mk-line/70 px-5 py-2.5 text-[13px] last:border-b-0" data-activity={e.action}>
              {/* When and who stacked, so the detail keeps its width on 1366-wide screens. */}
              <span className="w-[150px] shrink-0 leading-snug">
                <span className="num block text-[12px] whitespace-nowrap text-mk-muted">{time(e.at)}</span>
                <span className="block text-mk-ink-2">{e.by}</span>
              </span>
              <span className="min-w-0 flex-1 leading-snug">{e.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
