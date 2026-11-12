"use client";

// Small presentational pieces shared by the Quote screen and the printed quote.

import { Check } from "lucide-react";
import { formatINR } from "@/domain/format";
import type { QuoteModel } from "@/domain/quote";
import type { ProjectStatus } from "@/domain/types";
import { cn } from "@/lib/utils";

const sqftText = (n: number) => n.toFixed(2);

/** "CARCASS 26.51 · ₹7,421" — sq ft and cost. A dash when there is none (fillers have no carcass). */
export function CostTag({ kind, sqft, cost, className }: { kind: "carcass" | "shutter"; sqft: number; cost: number; className?: string }) {
  return (
    <span
      className={cn(
        "num inline-flex h-[22px] items-center rounded-[5px] px-1.5 text-[10.5px] tracking-[0.02em] whitespace-nowrap",
        kind === "carcass" ? "bg-[#edf0f4] text-[#46505e]" : "bg-[#e8f1e6] text-[#3f6a46]",
        className,
      )}
    >
      {kind === "carcass" ? "CARCASS" : "SHUTTER"} {cost ? `${sqftText(sqft)} · ${formatINR(cost)}` : "–"}
    </span>
  );
}

export const STATUS_TEXT: Record<ProjectStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending manager approval",
  approved: "Approved",
};

export function StatusPill({ status }: { status: ProjectStatus }) {
  return (
    <span
      data-status-pill={status}
      className={cn(
        "inline-flex h-[30px] items-center gap-2 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap",
        status === "draft" && "bg-mk-subtle text-mk-ink-2",
        status === "pending_approval" && "bg-[#e7effc] text-[#2a5bb8]",
        status === "approved" && "bg-mk-ok-soft text-mk-ok",
      )}
    >
      {status === "approved" ? <Check className="size-3.5" strokeWidth={2.5} /> : <span className={cn("size-2 rounded-full", status === "draft" ? "bg-mk-faint" : "bg-[#2f6bd8]")} />}
      {STATUS_TEXT[status]}
    </span>
  );
}

export function Swatch({ hex, className }: { hex: string; className?: string }) {
  return <span className={cn("inline-block size-3 shrink-0 rounded-[3px] border border-black/10", className)} style={{ background: hex }} />;
}

export function IncludedBadge() {
  return <span className="num rounded-[4px] bg-mk-subtle px-1.5 py-0.5 text-[10px] tracking-[0.08em] text-mk-ink-2">INCLUDED</span>;
}

/** All checks passed, or the items that need approval. */
export function ChecksSummary({ checks, ruleSet }: { checks: QuoteModel["checks"]; ruleSet?: string }) {
  if (!checks.approvals.length) {
    return (
      <span className="inline-flex h-[32px] items-center gap-2 rounded-full bg-mk-ok-soft px-3.5 text-[13px] font-medium text-mk-ok" data-quote-checks="ok">
        <Check className="size-4" strokeWidth={2.5} />
        {ruleSet ? `Checked against rule set ${ruleSet} — all checks passed` : "All checks passed"}
      </span>
    );
  }
  return (
    <div className="rounded-xl bg-[#e7effc] px-3.5 py-2.5 text-[13px] text-[#2a5bb8]" data-quote-checks="approval">
      <div className="font-medium">{ruleSet ? `Checked against rule set ${ruleSet} — needs approval:` : "Needs manager approval"}</div>
      <ul className="mt-1 space-y-0.5">
        {checks.approvals.map((a) => (
          <li key={a.message} className="flex gap-2">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#2f6bd8]" />
            {a.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** W × H × D in mono, as on the mockup. */
export const sizeText = (s: { w: number; h: number; d: number }) => `${s.w} × ${s.h} × ${s.d}`;
