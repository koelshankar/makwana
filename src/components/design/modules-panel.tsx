"use client";

import { useDraggable } from "@dnd-kit/core";
import { AirVent, CookingPot, Droplets, Flame, GripVertical, Microwave, Refrigerator, Search, WashingMachine } from "lucide-react";
import { useMemo, useState } from "react";
import { catalogue } from "@/domain/catalogue";
import { formatINR } from "@/domain/format";
import { unitPrice } from "@/domain/pricing";
import { validShutterTypes } from "@/domain/rules/product";
import type { Appliance, CatalogueModule } from "@/domain/types";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project-store";
import { ModuleIcon } from "./module-icon";

const TABS = ["Base", "Wall", "Loft", "Tall", "Appliances", "Hardware"] as const;
type Tab = (typeof TABS)[number];

const TAB_LAYER: Partial<Record<Tab, CatalogueModule["layer"]>> = { Base: "base", Wall: "wall", Loft: "loft", Tall: "tall" };

/** "From" price: BWP Plywood carcass, laminate shutters, standard shutter type (or the only valid one). */
const FROM_PRICE = new Map(
  catalogue.modules
    .filter((m) => m.family !== "FIL")
    .map((m) => {
      const finishId = "laminate-charcoal";
      const valid = validShutterTypes(catalogue, m.code, finishId);
      const price = unitPrice(
        {
          id: "price",
          moduleCode: m.code,
          wallId: "",
          layer: m.layer === "any" ? "base" : m.layer,
          offsetMm: 0,
          widthMm: m.widthMm,
          carcassId: "bwp",
          finishId,
          shutterTypeId: valid.includes("standard") ? "standard" : valid[0],
          hardware: [],
          isCustomSize: false,
        },
        catalogue,
      );
      return [m.code, price] as const;
    }),
);

function ModuleCard({ mod, inUse, selected }: { mod: CatalogueModule; inUse: boolean; selected: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `module:${mod.code}`, data: { moduleCode: mod.code } });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-module={mod.code}
      className={cn(
        "group flex cursor-grab touch-none items-center gap-2.5 rounded-xl border bg-mk-panel p-2 pr-1.5 transition-colors select-none active:cursor-grabbing",
        selected ? "border-mk-accent bg-mk-accent-soft" : "border-mk-line hover:border-[#cfc9bf]",
        isDragging && "border-dashed opacity-50",
      )}
    >
      <span className="flex size-[46px] shrink-0 items-center justify-center rounded-lg bg-mk-canvas text-mk-ink">
        <ModuleIcon mod={mod} className="size-9" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn("num block text-[11.5px]", inUse ? "text-mk-accent-ink" : "text-mk-muted")}>
          {mod.code}
          {inUse && <span> · in use</span>}
        </span>
        <span className="mt-0.5 block truncate text-[13.5px] font-medium text-mk-ink">{mod.name}</span>
        <span className="num mt-0.5 block text-[11px] tracking-[-0.02em] whitespace-nowrap text-mk-muted">
          {mod.widthMm} mm · from {formatINR(FROM_PRICE.get(mod.code) ?? 0)}
        </span>
      </span>
      <GripVertical className="size-4 shrink-0 text-mk-faint" />
    </div>
  );
}

const APPLIANCE_ICONS: Record<string, typeof Flame> = {
  hob: Flame,
  sink: Droplets,
  chimney: AirVent,
  oven: CookingPot,
  microwave: Microwave,
  dishwasher: WashingMachine,
  fridge: Refrigerator,
};

const applianceMeta = (a: Appliance) => `${a.widthMm} × ${a.heightMm} × ${a.depthMm} mm`;

function ApplianceCard({ a, inUse }: { a: Appliance; inUse: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `appliance:${a.id}`, data: { applianceId: a.id } });
  const Icon = APPLIANCE_ICONS[a.id] ?? CookingPot;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-appliance={a.id}
      className={cn(
        "group flex cursor-grab touch-none items-center gap-2.5 rounded-xl border border-mk-line bg-mk-panel p-2 pr-1.5 transition-colors select-none hover:border-[#cfc9bf] active:cursor-grabbing",
        isDragging && "border-dashed opacity-50",
      )}
    >
      <span className="flex size-[46px] shrink-0 items-center justify-center rounded-lg bg-mk-canvas text-mk-ink">
        <Icon className="size-6" strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn("block text-[11.5px]", inUse ? "text-mk-accent-ink" : "text-mk-muted")}>
          {a.hosted ? `Fits in ${a.layer === "tall" ? "T600OM" : a.id === "sink" ? "SU900" : "HU900"}` : `${a.layer === "wall" ? "Wall" : a.layer === "tall" ? "Tall" : "Base"} row`}
          {inUse && <span> · in use</span>}
        </span>
        <span className="mt-0.5 block truncate text-[13.5px] font-medium text-mk-ink">{a.name}</span>
        <span className="num mt-0.5 block truncate text-[11px] tracking-[-0.02em] text-mk-muted">{applianceMeta(a)}</span>
        <span className="num mt-0.5 block truncate text-[11px] tracking-[-0.02em] text-mk-muted">
          {a.price ? formatINR(a.price) : "No charge"}
          {a.cutOut && ` · cut-out ${a.cutOut.widthMm} × ${a.cutOut.depthMm}`}
        </span>
      </span>
      <GripVertical className="size-4 shrink-0 text-mk-faint" />
    </div>
  );
}

export function ApplianceDragPreview({ applianceId, compact }: { applianceId: string; compact: boolean }) {
  const a = catalogue.appliances.find((x) => x.id === applianceId);
  if (!a) return null;
  const Icon = APPLIANCE_ICONS[a.id] ?? CookingPot;
  if (compact) {
    return (
      <span className="pointer-events-none inline-flex translate-x-3 translate-y-3 rounded-md bg-mk-ink px-2 py-1 text-[11px] text-white shadow-md">
        {a.name}
      </span>
    );
  }
  return (
    <div className="pointer-events-none flex w-[240px] -rotate-2 items-center gap-3 rounded-xl border border-mk-line bg-mk-panel p-2.5 shadow-[0_12px_32px_rgba(28,27,25,0.18)]">
      <span className="flex size-[50px] shrink-0 items-center justify-center rounded-lg bg-mk-canvas text-mk-ink">
        <Icon className="size-6" strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13.5px] font-medium">{a.name}</span>
        <span className="num mt-0.5 block text-[11.5px] text-mk-muted">{applianceMeta(a)}</span>
      </span>
    </div>
  );
}

/** Drag preview: the card lifted, or a compact chip while over a wall. */
export function ModuleDragPreview({ moduleCode, compact }: { moduleCode: string; compact: boolean }) {
  const mod = catalogue.modules.find((m) => m.code === moduleCode);
  if (!mod) return null;
  if (compact) {
    return (
      <span className="num pointer-events-none inline-flex translate-x-3 translate-y-3 rounded-md bg-mk-ink px-2 py-1 text-[11px] text-white shadow-md">
        {mod.code} · {mod.widthMm}
      </span>
    );
  }
  return (
    <div className="pointer-events-none flex w-[240px] -rotate-2 items-center gap-3 rounded-xl border border-mk-line bg-mk-panel p-2.5 shadow-[0_12px_32px_rgba(28,27,25,0.18)]">
      <span className="flex size-[50px] shrink-0 items-center justify-center rounded-lg bg-mk-canvas text-mk-ink">
        <ModuleIcon mod={mod} className="size-10" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="num block text-[11.5px] text-mk-muted">{mod.code}</span>
        <span className="mt-0.5 block truncate text-[13.5px] font-medium">{mod.name}</span>
        <span className="num mt-0.5 block text-[11.5px] text-mk-muted">
          {mod.widthMm} mm · from {formatINR(FROM_PRICE.get(mod.code) ?? 0)}
        </span>
      </span>
    </div>
  );
}

function ReadOnlyRow({ title, meta, price }: { title: string; meta: string; price: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-mk-line p-3">
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13.5px] font-medium">{title}</span>
        <span className="num mt-0.5 block text-[11.5px] text-mk-muted">{meta}</span>
      </span>
      <span className="num text-[12px] text-mk-ink-2">{price}</span>
    </div>
  );
}

export function ModulesPanel() {
  const [tab, setTab] = useState<Tab>("Base");
  const [query, setQuery] = useState("");
  const modules = useProjectStore((s) => s.project.modules);
  const appliances = useProjectStore((s) => s.project.appliances);
  const appliancesInUse = useMemo(() => new Set(appliances.map((a) => a.applianceId)), [appliances]);
  const selectedId = useProjectStore((s) => s.ui.selectedPlacementId);
  const inUse = useMemo(() => new Set(modules.map((m) => m.moduleCode)), [modules]);
  const selectedCode = modules.find((m) => m.id === selectedId)?.moduleCode;

  const q = query.trim().toLowerCase();
  const matches = (code: string, name: string) => !q || code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
  const layer = TAB_LAYER[tab];
  // Searching looks across every row; otherwise the tab picks the row.
  const cards = catalogue.modules.filter((m) => m.family !== "FIL" && (q ? matches(m.code, m.name) : m.layer === layer));
  const applianceCards = q ? catalogue.appliances.filter((a) => matches(a.id, a.name)) : [];

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-mk-line bg-mk-panel">
      <div className="px-5 pt-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium tracking-[0.16em] text-mk-faint uppercase">Modules</h2>
          <span className="text-[12px] text-mk-faint">Drag onto a wall</span>
        </div>
        <label className="flex h-[36px] items-center gap-2 rounded-lg border border-mk-line px-3 focus-within:border-mk-accent focus-within:ring-2 focus-within:ring-mk-accent/20">
          <Search className="size-4 text-mk-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules or codes"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-mk-faint"
          />
        </label>
        <div role="tablist" aria-label="Module categories" className="mt-3 grid grid-cols-3 gap-0.5 rounded-xl bg-mk-subtle p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={!q && tab === t}
              onClick={() => {
                setTab(t);
                setQuery("");
              }}
              className={cn(
                "h-[30px] rounded-lg text-[12.5px] transition-colors",
                !q && tab === t ? "bg-mk-panel font-medium text-mk-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-mk-ink-2 hover:text-mk-ink",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 pb-3">
        {!q && tab === "Appliances" ? (
          catalogue.appliances.map((a) => <ApplianceCard key={a.id} a={a} inUse={appliancesInUse.has(a.id)} />)
        ) : !q && tab === "Hardware" ? (
          <>
            <p className="rounded-lg bg-mk-canvas px-3 py-2 text-[12px] text-mk-muted">Placement coming soon · add hardware to a unit in the inspector</p>
            {catalogue.hardware.map((h) => (
              <ReadOnlyRow key={h.id} title={h.name} meta={h.included ? "Included with units" : "Add-on"} price={h.included ? "Included" : formatINR(h.price)} />
            ))}
          </>
        ) : cards.length || applianceCards.length ? (
          <>
            {cards.map((m) => (
              <ModuleCard key={m.code} mod={m} inUse={inUse.has(m.code)} selected={m.code === selectedCode} />
            ))}
            {applianceCards.map((a) => (
              <ApplianceCard key={a.id} a={a} inUse={appliancesInUse.has(a.id)} />
            ))}
          </>
        ) : (
          <p className="px-1 py-4 text-[13px] text-mk-faint">No modules match “{query}”.</p>
        )}
      </div>

      <p className="border-t border-mk-line px-5 py-3 text-[11.5px] leading-relaxed text-mk-faint">
        Prices shown for BWP Plywood carcass with laminate shutters. Finish upgrades are priced in the inspector.
      </p>
    </aside>
  );
}
