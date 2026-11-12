"use client";

import { MessageSquareWarning, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef } from "react";
import type { SceneApi } from "@/components/three/kitchen-scene";
import { Button } from "@/components/ui/button";
import { catalogue } from "@/domain/catalogue";
import { formatINR } from "@/domain/format";
import { formatDate, quoteModel } from "@/domain/quote";
import { hasBlocked } from "@/domain/rules";
import { useProjectStore, useRawChecks, useRoomValidation } from "@/store/project-store";
import { ActivityLog, AppliancesCard, HardwareCard, TotalsCard } from "./quote-cards";
import { QuoteFooter } from "./quote-footer";
import { QuoteGroups } from "./quote-groups";
import { StatusPill } from "./quote-parts";
import { QuoteSide } from "./quote-side";

/** Mockup 4: the quote for review, approval and sharing. */
export function QuoteScreen() {
  const project = useProjectStore((s) => s.project);
  const role = useProjectStore((s) => s.settings.role);
  const results = useRawChecks();
  const room = useRoomValidation();
  const blocked = hasBlocked(results);
  const scene = useRef<SceneApi>(null);
  const approvalMode = useProjectStore((s) => s.settings.approvalMode);
  const model = useMemo(() => quoteModel(project, catalogue, results, { approvalMode }), [project, results, approvalMode]);

  if (!room.ok || blocked) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-mk-canvas text-center">
        <p className="text-[15px] font-medium">{room.ok ? "Resolve the blocked checks before reviewing the quote" : "Finish the room before reviewing the quote"}</p>
        <p className="max-w-md text-[13px] text-mk-muted">{room.ok ? `${results.filter((r) => r.status === "blocked").length} blocked check(s) in Design.` : room.issues[0]?.message}</p>
        <Button render={<Link href={room.ok ? "/design" : "/setup"} />} variant="outline">
          {room.ok ? "Back to Design" : "Back to Room Setup"}
        </Button>
      </div>
    );
  }

  const h = model.header;
  const sentBack = project.status === "draft" ? project.quote?.sentBack : undefined;
  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-6 border-b border-mk-line bg-mk-panel px-8 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <h1 className="text-[24px] font-medium tracking-tight whitespace-nowrap" data-quote-title>
              {project.quote ? (
                <>
                  Quote <span className="num">{h.quoteNumber}</span> · Version {h.version}
                </>
              ) : (
                <>Draft quote · Version {h.version}</>
              )}
            </h1>
            <StatusPill status={project.status} />
          </div>
          <p className="mt-1 text-[14.5px] text-mk-muted">
            {h.projectName} · {h.date} · Prepared by {h.preparedBy}
            {h.approvedBy && ` · Approved by ${h.approvedBy}, ${h.approvedAt}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[13.5px] text-mk-muted">Grand total</div>
          <div className="flex items-baseline gap-2">
            <span className="num text-[34px] leading-tight font-semibold tracking-tight" data-quote-header-total>
              {formatINR(model.totals.grandTotal)}
            </span>
            <span className="text-[14px] text-mk-muted">incl. GST</span>
          </div>
        </div>
      </div>

      {sentBack && (
        <div className="flex shrink-0 items-center gap-3 border-b border-[#f0d9b5] bg-mk-warn-soft px-8 py-2.5 text-[13.5px]" role="status" data-sent-back>
          <MessageSquareWarning className="size-4 shrink-0 text-mk-warn" />
          <span>
            <span className="font-medium">Sent back by {sentBack.by}</span> <span className="text-mk-muted">· {formatDate(sentBack.at)}</span>: “{sentBack.comment}”
          </span>
          <span className="ml-auto text-mk-muted">Make the change, then send for approval again.</span>
        </div>
      )}
      {role === "manager" && project.status === "pending_approval" && (
        <div className="flex shrink-0 items-center gap-3 border-b border-[#cddcf6] bg-[#eef3fd] px-8 py-2.5 text-[13.5px] text-[#2a5bb8]" role="status">
          <ShieldCheck className="size-4 shrink-0" />
          Waiting for your approval{model.checks.approvals.length ? `: ${model.checks.approvals.map((a) => a.label).join("; ")}` : "."}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f6f3]">
        <div className="grid grid-cols-[minmax(340px,410px)_1fr] gap-7 px-8 py-6">
          <QuoteSide model={model} scene={scene} />
          <div className="flex min-w-0 flex-col gap-5">
            <QuoteGroups model={model} />
            <div className="grid grid-cols-2 gap-4">
              <HardwareCard model={model} />
              <AppliancesCard model={model} />
            </div>
            <div className="grid grid-cols-[1fr_340px] items-start gap-4">
              <ActivityLog entries={project.activity ?? []} />
              <TotalsCard model={model} editable />
            </div>
          </div>
        </div>
      </div>
      <QuoteFooter model={model} results={results} scene={scene} />
    </>
  );
}
