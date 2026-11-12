"use client";

// The quote as an A4 document for "Download PDF": built from quoteModel like the Quote screen,
// read-only, with page breaks between sections. Opened with ?auto=1 it prints itself once ready.

import { ArrowLeft, Printer } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DesignPlan } from "@/components/design/design-plan";
import { Elevation } from "@/components/design/elevation/elevation";
import type { SceneApi } from "@/components/three/kitchen-scene";
import { SceneBoundary } from "@/components/three/scene-boundary";
import { catalogue } from "@/domain/catalogue";
import { formatINR } from "@/domain/format";
import { placementsOnWall } from "@/domain/geometry";
import { quoteModel, type QuoteItem } from "@/domain/quote";
import { runRawChecks } from "@/domain/rules";
import { isRestored, restoreSavedProject, useHydrated, useProjectStore } from "@/store/project-store";
import { UnitTable } from "./quote-groups";
import { ChecksSummary, IncludedBadge, STATUS_TEXT, Swatch } from "./quote-parts";
import { snapshotStep } from "./snapshot-wait";

const KitchenScene = dynamic(() => import("@/components/three/kitchen-scene").then((m) => m.KitchenScene), { ssr: false });
const EMPTY = new Set<string>();

const PRINT_CSS = `
@page { size: A4; margin: 13mm 12mm 15mm; }
@media print {
  html, body { background: white !important; }
  .no-print { display: none !important; }
  .print-page { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: auto !important; }
  .page-break { break-before: page; }
  .avoid-break { break-inside: avoid; }
}
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/** Renders the room offscreen at a fixed size and hands back one iso snapshot ("" if 3D is unavailable). */
function OffscreenSnapshot({ onShot }: { onShot: (url: string) => void }) {
  const project = useProjectStore((s) => s.project);
  const api = useRef<SceneApi>(null);
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const attempt = () => {
      if (cancelled) return;
      const step = snapshotStep(!!api.current, tries, Date.now() - started);
      if (step === "give-up") return onShot(""); // Prints without the picture ("not available").
      if (step === "shoot") {
        let url = "";
        try {
          url = api.current!.snapshot();
        } catch {
          // Shown as "not available" in the document.
        }
        onShot(url);
        return;
      }
      tries++;
      timer = setTimeout(attempt, 150);
    };
    attempt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onShot]);
  return (
    <div aria-hidden className="no-print fixed top-0 -left-[5000px] h-[640px] w-[960px]">
      <SceneBoundary onUnavailable={() => onShot("")} fallback={null}>
        <KitchenScene ref={api} project={project} selectedId={null} blockedIds={EMPTY} wallHeight="cut" interactive={false} />
      </SceneBoundary>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="num mb-2 border-b border-mk-ink pb-1 text-[10px] font-semibold tracking-[0.18em] text-mk-ink uppercase">{children}</h2>;
}

function Items({ title, total, items, qty }: { title: string; total: number; items: QuoteItem[]; qty: boolean }) {
  return (
    <div className="avoid-break">
      <div className="mb-1 flex items-baseline justify-between text-[12px] font-semibold">
        <span>{title}</span>
        <span className="num">{formatINR(total)}</span>
      </div>
      <table className="w-full text-[10.5px]">
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.name}-${i}`} className="border-b border-mk-line/80 align-top">
              <td className="py-1 pr-2">
                {it.name}
                {it.sub && <div className="text-[9.5px] text-mk-muted">{it.sub}</div>}
              </td>
              {qty && <td className="num w-8 py-1 text-right text-mk-muted">×{it.qty}</td>}
              <td className="w-[86px] py-1 text-right whitespace-nowrap">
                {it.included ? <IncludedBadge /> : <span className="num">{formatINR(it.amount)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrintQuote() {
  const hydrated = useHydrated();
  useEffect(() => {
    if (!isRestored()) void restoreSavedProject();
  }, []);
  const project = useProjectStore((s) => s.project);
  const handed = useProjectStore((s) => s.ui.snapshot);
  const [ownShot, setOwnShot] = useState<string | null>(null);
  /** A data URL, "" when 3D isn't available, null while it is still being rendered. */
  const snapshot = handed ?? ownShot;
  const results = useMemo(() => runRawChecks(project, catalogue), [project]);
  const approvalMode = useProjectStore((s) => s.settings.approvalMode);
  const model = useMemo(() => quoteModel(project, catalogue, results, { approvalMode }), [project, results, approvalMode]);
  const walls = project.room.walls.filter((w) => placementsOnWall(project, w.id).length > 0);
  const h = model.header;
  const [ready, setReady] = useState(false);

  // A sensible file name for "Save as PDF", then print once the picture and fonts are in.
  useEffect(() => {
    if (!hydrated) return;
    document.title = `${h.quoteNumber}-V${h.version}-${(h.customerName || h.projectName).replace(/\s+/g, "-")}`;
  }, [hydrated, h.quoteNumber, h.version, h.customerName, h.projectName]);
  useEffect(() => {
    if (!hydrated || snapshot === null || ready) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      setReady(true);
      if (new URLSearchParams(window.location.search).get("auto") === "1") setTimeout(() => window.print(), 250);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, snapshot, ready]);

  if (!hydrated) return <div className="p-10 text-[13px] text-mk-muted">Preparing the quote…</div>;

  return (
    <div className="min-h-screen bg-[#e9e7e3] py-8 text-mk-ink print:bg-white print:py-0" data-print-ready={ready || undefined}>
      <style>{PRINT_CSS}</style>
      {h.watermark && (
        // Fixed, so Chrome repeats it on every printed page.
        <div aria-hidden className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center overflow-hidden" data-watermark>
          <span className="-rotate-[35deg] text-[150px] font-bold tracking-[0.2em] whitespace-nowrap text-[rgba(28,27,25,0.07)] select-none">{h.watermark}</span>
        </div>
      )}
      {snapshot === null && <OffscreenSnapshot onShot={setOwnShot} />}
      <div className="no-print mx-auto mb-4 flex w-[210mm] items-center justify-between">
        <Link href="/quote" className="flex items-center gap-2 text-[13.5px] font-medium hover:underline">
          <ArrowLeft className="size-4" /> Back to the quote
        </Link>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-mk-ink px-4 py-2 text-[13.5px] font-medium text-white">
          <Printer className="size-4" /> Print / Save as PDF
        </button>
      </div>

      <article className="print-page mx-auto w-[210mm] bg-white px-[12mm] py-[13mm] text-[11px] shadow-[0_4px_24px_rgba(0,0,0,0.12)]">
        {/* Header */}
        <header className="flex items-start justify-between border-b-2 border-mk-ink pb-4">
          <div className="leading-none">
            <div className="text-[20px] font-semibold tracking-[0.32em]">MAKWANA</div>
            <div className="mt-1.5 text-[8px] font-medium tracking-[0.38em] text-mk-muted">MODULAR KULTURE</div>
            <div className="mt-3 text-[10px] text-mk-muted">Experience Centre, Andheri West, Mumbai</div>
          </div>
          <div className="text-right">
            <div className="text-[16px] font-semibold">Kitchen quote</div>
            <div className="num mt-1 text-[13px]">{h.quoteNumber}</div>
            <div className="mt-0.5 text-[10.5px] text-mk-muted">Version {h.version}</div>
          </div>
        </header>
        <dl className="mt-4 grid grid-cols-[auto_1fr_auto_1fr] gap-x-5 gap-y-1.5 text-[11px]">
          {[
            ["Customer", h.customerName || "—"],
            ["Quote number", `${h.quoteNumber} · Version ${h.version}`],
            ["Site", h.siteAddress || "—"],
            ["Date", h.date],
            ["Project", h.projectName],
            ["Valid until", `${h.validUntil} (${h.validityDays} days)`],
            ["Prepared by", h.preparedBy],
            ["Status", (h.pdfStatus === "final" ? "Final" : STATUS_TEXT[h.pdfStatus]) + (h.approvedBy ? ` · by ${h.approvedBy}, ${h.approvedAt}` : "")],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-mk-muted">{k}</dt>
              <dd className={k === "Quote number" ? "num" : undefined}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-end justify-between rounded-lg bg-[#f4f2ee] px-4 py-3">
          <span className="text-[11px] text-mk-ink-2">
            {model.summary.modules} units · {model.summary.appliances} appliances · {model.summary.layout}
          </span>
          <span className="text-right">
            <span className="block text-[10px] text-mk-muted">Grand total incl. GST</span>
            <span className="num text-[20px] font-semibold" data-print-total>
              {formatINR(model.totals.grandTotal)}
            </span>
          </span>
        </div>

        {/* 3D and plan */}
        <section className="avoid-break mt-4">
          <SectionTitle>3D · Final design</SectionTitle>
          {snapshot ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL, not an optimisable asset
            <img src={snapshot} alt="3D view of the kitchen" className="mx-auto block max-h-[78mm] w-auto rounded-md bg-[#f1efeb]" data-print-3d />
          ) : (
            <div className="flex h-[90mm] items-center justify-center rounded-md bg-[#f1efeb] text-mk-muted">
              {snapshot === "" ? "3D view isn't available on this device" : "Rendering the 3D view…"}
            </div>
          )}
        </section>
        <section className="avoid-break mt-4">
          <SectionTitle>Plan · {model.summary.walls} walls</SectionTitle>
          <div className="relative flex h-[62mm]" data-print-plan>
            <DesignPlan readOnly />
          </div>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1">
            <span className="text-mk-muted">Room</span>
            <span>
              {model.summary.walls} walls · ceiling {model.summary.ceilingMm} mm
            </span>
            <span className="text-mk-muted">Carcass</span>
            <span>{model.summary.carcasses.join(", ")}</span>
            <span className="text-mk-muted">Finishes</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {model.summary.finishes.map((f) => (
                <span key={f.name} className="flex items-center gap-1.5">
                  <Swatch hex={f.hex} /> {f.name}
                </span>
              ))}
            </span>
          </div>
        </section>

        {/* Elevations: one per wall with units */}
        {walls.map((w, i) => (
          <section key={w.id} className={`avoid-break mt-5 ${i % 2 === 0 ? "page-break" : ""}`} data-print-elevation-section={w.id}>
            <SectionTitle>
              Elevation · Wall {w.id} · {w.lengthMm} × {project.room.ceilingHeightMm}
            </SectionTitle>
            <div className="mx-auto w-[60%]">
              <Elevation wallId={w.id} print />
            </div>
          </section>
        ))}

        {/* Line items */}
        <section className="page-break">
          <SectionTitle>Units</SectionTitle>
          <div className="space-y-4" style={{ zoom: 0.74 }}>
            {model.groups
              .filter((g) => g.count > 0)
              .map((g) => (
                <div key={g.group} className="avoid-break rounded-lg border border-mk-line">
                  <div className="flex items-baseline justify-between border-b border-mk-line px-6 py-2">
                    <span className="text-[15px] font-semibold">
                      {g.label} <span className="ml-3 text-[13px] font-normal text-mk-muted">{g.count} units</span>
                      {g.note && <span className="ml-3 text-[12px] font-normal text-mk-muted">{g.note}</span>}
                    </span>
                    <span className="num text-[15px] font-semibold">{formatINR(g.amount)}</span>
                  </div>
                  <UnitTable group={g} />
                </div>
              ))}
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <Items title="Hardware & Accessories" total={model.hardware.total} items={model.hardware.items} qty />
          <Items title="Appliances & Countertop" total={model.appliances.total} items={model.appliances.items} qty={false} />
        </section>

        <section className="avoid-break mt-5 ml-auto w-[80mm] text-[11.5px]" data-print-totals>
          {[
            ["Subtotal", formatINR(model.totals.subtotal)],
            [`Discount ${model.totals.discountPct}%`, model.totals.discount ? `−${formatINR(model.totals.discount)}` : formatINR(0)],
            ["Taxable value", formatINR(model.totals.taxableValue)],
            [`GST ${model.totals.gstPct}%`, formatINR(model.totals.gst)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-mk-ink-2">{k}</span>
              <span className="num">{v}</span>
            </div>
          ))}
          <div className="mt-1.5 flex items-baseline justify-between border-t-2 border-mk-ink pt-1.5 text-[14px] font-semibold">
            <span>Grand total</span>
            <span className="num">{formatINR(model.totals.grandTotal)}</span>
          </div>
        </section>

        <section className="avoid-break mt-6">
          <ChecksSummary checks={model.checks} ruleSet={h.ruleSetVersion} approvedBy={h.approvedBy} />
        </section>

        <section className="avoid-break mt-6 rounded-lg border border-dashed border-mk-faint p-4 text-[10px] leading-relaxed text-mk-ink-2" data-print-terms>
          <div className="mb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-mk-bad uppercase">Sample terms — demo only, not contractual</div>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Prices are valid for {h.validityDays} days from the quote date and include GST at {model.totals.gstPct}%.</li>
            <li>Final measurements are taken on site before production; the quote may change if the site differs from this design.</li>
            <li>Customer-supplied appliances are fitted but not covered by Makwana&apos;s warranty.</li>
            <li>Sample catalogue and prices for demonstration only.</li>
          </ol>
        </section>
      </article>
    </div>
  );
}
