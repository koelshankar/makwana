"use client";

import { ArrowLeft, ArrowRight, Check, Copy, Download, MessageCircle, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import type { SceneApi } from "@/components/three/kitchen-scene";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatINR } from "@/domain/format";
import { canShare, whatsappMessage, type QuoteModel } from "@/domain/quote";
import type { CheckResult } from "@/domain/types";
import { projectStore, useProjectStore } from "@/store/project-store";

/**
 * Gives the quote its number if it has none, logs the download in Activity, takes the 3D picture at
 * the iso preset, hands it to the print page and opens it. Used by the footer and the Share dialog.
 */
export function useDownloadPdf(scene: RefObject<SceneApi | null>) {
  const router = useRouter();
  return () => {
    projectStore.getState().ensureQuote();
    projectStore.getState().markShared("PDF downloaded to send");
    let shot: string | null = null;
    try {
      shot = scene.current?.snapshot() ?? null;
    } catch {
      shot = null; // the print page renders its own
    }
    projectStore.getState().setSnapshot(shot);
    router.push("/quote/print?auto=1");
  };
}

function ShareDialog({ open, onOpenChange, model, onDownload }: { open: boolean; onOpenChange: (o: boolean) => void; model: QuoteModel; onDownload: () => void }) {
  const message = whatsappMessage(model, formatINR);
  /** The clipboard API failed or is missing: the message is selected for ⌘C / Ctrl+C instead. */
  const [manualCopy, setManualCopy] = useState(false);
  const text = useRef<HTMLTextAreaElement>(null);
  const change = (o: boolean) => {
    if (!o) setManualCopy(false);
    onOpenChange(o);
  };
  useEffect(() => {
    if (!manualCopy) return;
    text.current?.focus();
    text.current?.select();
  }, [manualCopy]);
  const copied = (how: string) => {
    toast.success("WhatsApp message copied");
    projectStore.getState().markShared(how);
  };
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("No clipboard API");
      await navigator.clipboard.writeText(message);
    } catch {
      setManualCopy(true);
      return;
    }
    copied("WhatsApp message copied");
  };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-[520px]" data-share-dialog>
        <DialogHeader>
          <DialogTitle>Share with {model.header.customerName || "the customer"}</DialogTitle>
          <DialogDescription>
            Quote <span className="num">{model.header.quoteNumber}</span> · Version {model.header.version} · <span className="num font-medium text-mk-ink">{formatINR(model.totals.grandTotal)}</span> incl. GST · valid until{" "}
            {model.header.validUntil}
          </DialogDescription>
        </DialogHeader>
        <textarea
          ref={text}
          readOnly
          value={message}
          rows={9}
          aria-label="WhatsApp message"
          onCopy={() => manualCopy && copied("WhatsApp message copied")}
          className={`w-full resize-none rounded-lg border bg-mk-canvas p-3 text-[13px] leading-relaxed outline-none ${manualCopy ? "border-mk-accent ring-2 ring-mk-accent/20" : "border-mk-line"}`}
        />
        {manualCopy && (
          <p className="-mt-2 text-[13px] font-medium text-mk-accent-ink" role="status" data-manual-copy>
            Press ⌘C / Ctrl+C to copy
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            className="gap-2"
            onClick={onDownload}
          >
            <Download className="size-4" /> Download PDF
          </Button>
          <Button className="gap-2" onClick={copy}>
            <Copy className="size-4" /> Copy WhatsApp message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendBackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const preparedBy = useProjectStore((s) => s.project.preparedBy);
  const [comment, setComment] = useState("");
  const ok = comment.trim().length >= 3;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]" data-send-back-dialog>
        <DialogHeader>
          <DialogTitle>Send back to the salesperson</DialogTitle>
          <DialogDescription>Say what needs to change. They will see this on the quote.</DialogDescription>
        </DialogHeader>
        <textarea
          autoFocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          aria-label="Comment"
          placeholder="e.g. Keep the discount at 5% for this customer"
          className="w-full resize-none rounded-lg border border-mk-line p-3 text-[13.5px] outline-none focus:border-mk-accent focus:ring-2 focus:ring-mk-accent/20"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!ok}
            onClick={() => {
              projectStore.getState().sendBack(comment);
              toast(`Sent back to ${preparedBy}`, { description: comment.trim() });
              setComment("");
              onOpenChange(false);
            }}
          >
            Send back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuoteFooter({ model, results, scene }: { model: QuoteModel; results: CheckResult[]; scene: RefObject<SceneApi | null> }) {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const { role, approvalMode } = useProjectStore((s) => s.settings);
  const [sharing, setSharing] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const download = useDownloadPdf(scene);
  const status = project.status;
  const shareable = canShare(project, results, approvalMode);
  const reviewing = role === "manager" && status === "pending_approval";

  const big = "h-[46px] rounded-lg px-6 text-[15px]";
  return (
    <footer className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-t border-mk-line bg-mk-panel px-8">
      <Button variant="outline" size="lg" className={`${big} gap-2.5`} onClick={() => router.push("/design")}>
        <ArrowLeft className="size-4" /> Back to Design
      </Button>
      <div className="flex items-center gap-3">
        {!reviewing && !shareable && (
          <span className="text-[13.5px] text-mk-muted" data-share-hint>
            {status === "pending_approval" ? "Waiting for manager approval" : "Available after approval"}
          </span>
        )}
        {!reviewing && (
          <Button
            variant="outline"
            size="lg"
            className={`${big} gap-2`}
            disabled={!shareable}
            onClick={() => {
              projectStore.getState().ensureQuote();
              setSharing(true);
            }}
            data-share
          >
            <MessageCircle className="size-4" /> Share with Customer
          </Button>
        )}
        <Button variant="outline" size="lg" className={`${big} gap-2`} onClick={download} data-download>
          <Download className="size-4" /> Download PDF
        </Button>
        {reviewing ? (
          <>
            <Button variant="outline" size="lg" className={`${big} gap-2`} onClick={() => setSendingBack(true)}>
              <Undo2 className="size-4" /> Send back
            </Button>
            <Button
              size="lg"
              className={`${big} gap-2.5 bg-mk-ok hover:bg-mk-ok/90`}
              onClick={() => {
                projectStore.getState().approve();
                toast.success(`Quote ${model.header.quoteNumber} approved`);
              }}
            >
              <Check className="size-4" /> Approve
            </Button>
          </>
        ) : status === "draft" ? (
          <Button
            size="lg"
            className={`${big} gap-2.5`}
            onClick={() => {
              projectStore.getState().sendForApproval();
              toast.success("Sent for manager approval");
            }}
          >
            Send for Approval <ArrowRight className="size-4" />
          </Button>
        ) : status === "pending_approval" ? (
          <Button size="lg" className={big} disabled>
            Sent for approval
          </Button>
        ) : (
          <span className="flex h-[46px] items-center gap-2 rounded-lg bg-mk-ok-soft px-4 text-[14px] font-medium text-mk-ok">
            <Check className="size-4" /> Approved{model.header.approvedBy ? ` by ${model.header.approvedBy}` : ""}
          </span>
        )}
      </div>
      <ShareDialog open={sharing} onOpenChange={setSharing} model={model} onDownload={download} />
      <SendBackDialog open={sendingBack} onOpenChange={setSendingBack} />
    </footer>
  );
}
