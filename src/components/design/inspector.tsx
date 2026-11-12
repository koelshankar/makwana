"use client";

import { Check, CookingPot, GalleryVerticalEnd, Grip, Hand, Plus, RotateCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { catalogue, getAppliance, getCarcass, getHardware, getModule, getShutterType } from "@/domain/catalogue";
import { formatINR } from "@/domain/format";
import { addOnTotal, appliancePrice, cutOutPrice, moduleLine } from "@/domain/pricing";
import { firstSentence, nearestValidOffset } from "@/domain/rules";
import { validShutterTypes } from "@/domain/rules/product";
import type { AppliancePlacement, BlindSide, HardwareSelection, ModulePlacement } from "@/domain/types";
import { cn } from "@/lib/utils";
import { projectStore, useProjectStore } from "@/store/project-store";

function Section({ n, title, aside, children }: { n: number; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-mk-line px-5 py-4 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="num text-[11px] font-medium tracking-[0.16em] text-mk-faint uppercase">
          {n} · {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-3 border-b border-mk-line/70 py-1 text-[13px] last:border-b-0">
      <span className="text-mk-muted">{label}</span>
      <span className="min-w-0 text-right text-mk-ink">{children}</span>
    </div>
  );
}

function InlineSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <Select items={options} value={value} onValueChange={(v) => v !== null && onChange(v as T)}>
      <SelectTrigger aria-label={label} className={cn("h-[34px]! w-full rounded-lg border-mk-line text-[13px]", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Size shown as W × H × D; fillers take the run's height and a 20 mm panel depth. */
function size(p: ModulePlacement) {
  const line = moduleLine(p, catalogue);
  return `${p.widthMm} × ${line.heightMm} × ${line.depthMm}`;
}

function moveToWall(p: ModulePlacement, wallId: string) {
  const { project } = projectStore.getState();
  const offset = nearestValidOffset(project, catalogue, p, wallId);
  if (offset === null) {
    toast.error(`${p.moduleCode} doesn't fit anywhere on Wall ${wallId}.`);
    return;
  }
  const res = projectStore.getState().movePlacement(p.id, wallId, offset);
  if (!res.ok) {
    const reason = res.results.find((r) => r.status === "blocked");
    toast.error(reason ? firstSentence(reason.message) : `Couldn't move ${p.moduleCode}.`);
    return;
  }
  projectStore.getState().select(p.id);
  toast.success(`Moved to Wall ${wallId} at ${offset} mm`);
}

const HARDWARE_ICONS: Record<string, typeof Grip> = {
  "hinge-soft-close": RotateCw,
  "handle-profile": Hand,
  "drawer-standard": GalleryVerticalEnd,
  "drawer-premium": GalleryVerticalEnd,
  "cutlery-organiser": Grip,
  "lift-up": RotateCw,
  "corner-carousel": CookingPot,
};

function HardwareIcon({ id }: { id: string }) {
  const Icon = HARDWARE_ICONS[id] ?? Grip;
  return (
    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-mk-canvas text-mk-ink-2">
      <Icon className="size-4" />
    </span>
  );
}

function HardwareSection({ p }: { p: ModulePlacement }) {
  const mod = getModule(catalogue, p.moduleCode);
  const update = (hardware: HardwareSelection[]) => projectStore.getState().updatePlacement(p.id, { hardware });
  const has = (id: string) => p.hardware.some((h) => h.itemId === id);
  const premium = has("drawer-premium");
  const { shutters, drawers } = mod.fronts;

  const included: { id: string; detail: string }[] = [];
  if (shutters > 0) included.push({ id: "hinge-soft-close", detail: `${2 * shutters} hinges` });
  if (p.shutterTypeId !== "handleless" && shutters + drawers > 0) included.push({ id: "handle-profile", detail: `${shutters + drawers} handle${shutters + drawers === 1 ? "" : "s"}` });
  const drawerChoice = drawers > 0 && mod.allowedHardwareIds.includes("drawer-premium");
  if (drawers > 0 && !drawerChoice) included.push({ id: "drawer-standard", detail: `${drawers} drawers` });

  const addOns = p.hardware.filter((h) => h.itemId !== "drawer-premium");
  const available = mod.allowedHardwareIds.filter((id) => !has(id) && id !== "drawer-premium");
  const fitted = included.length + (drawerChoice ? 1 : 0) + addOns.length;
  const premiumItem = getHardware(catalogue, "drawer-premium");

  if (mod.family === "FIL") {
    return (
      <Section n={3} title="Hardware">
        <p className="text-[12.5px] text-mk-faint">Filler panels take no hardware.</p>
      </Section>
    );
  }

  return (
    <Section n={3} title="Hardware" aside={<span className="num text-[12px] text-mk-faint">{fitted} fitted</span>}>
      <div className="space-y-3">
        {drawerChoice && (
          <div className="flex gap-3">
            <HardwareIcon id="drawer-premium" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13.5px] font-medium">Drawer system</span>
                <span className="num text-[13px]">{premium ? `+${formatINR(premiumItem.price)}` : <IncludedBadge />}</span>
              </div>
              <div className="mb-1.5 text-[12px] text-mk-muted">{premium ? `Tandem box, soft-close · ${drawers} drawers` : `Standard runners · ${drawers} drawers`}</div>
              <InlineSelect
                label="Drawer system"
                value={premium ? "premium" : "standard"}
                options={[
                  { value: "standard", label: "Standard (included)" },
                  { value: "premium", label: `Premium tandem box · +${formatINR(premiumItem.price)}` },
                ]}
                onChange={(v) =>
                  update(v === "premium" ? [...p.hardware, { itemId: "drawer-premium", qty: 1 }] : p.hardware.filter((h) => h.itemId !== "drawer-premium"))
                }
              />
            </div>
          </div>
        )}
        {addOns.map((h) => {
          const item = getHardware(catalogue, h.itemId);
          return (
            <div key={h.itemId} className="flex items-center gap-3">
              <HardwareIcon id={h.itemId} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium">{item.name}</div>
                <div className="num text-[12px] text-mk-muted">+{formatINR(item.price * h.qty)}</div>
              </div>
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                onClick={() => update(p.hardware.filter((x) => x.itemId !== h.itemId))}
                className="text-mk-faint hover:text-mk-bad"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
        {included.map((i) => (
          <div key={i.id} className="flex items-center gap-3">
            <HardwareIcon id={i.id} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13.5px] font-medium">{getHardware(catalogue, i.id).name}</span>
                <IncludedBadge />
              </div>
              <div className="text-[12px] text-mk-muted">{i.detail}</div>
            </div>
          </div>
        ))}
        {available.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex h-[38px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#cfc9bf] text-[13px] text-mk-ink hover:border-mk-ink-2"
                />
              }
            >
              <Plus className="size-3.5" /> Add hardware
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-64">
              {available.map((id) => {
                const item = getHardware(catalogue, id);
                return (
                  <DropdownMenuItem key={id} onClick={() => update([...p.hardware, { itemId: id, qty: 1 }])}>
                    <span className="flex-1">{item.name}</span>
                    <span className="num text-[12px] text-mk-muted">+{formatINR(item.price)}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Section>
  );
}

function IncludedBadge() {
  return <span className="num rounded bg-mk-subtle px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em] text-mk-ink-2 uppercase">Included</span>;
}

function ModuleInspector({ p }: { p: ModulePlacement }) {
  const walls = useProjectStore((s) => s.project.room.walls);
  const mod = getModule(catalogue, p.moduleCode);
  const line = moduleLine(p, catalogue);
  const addOns = addOnTotal(p, catalogue);
  const isFiller = mod.family === "FIL";
  const shutterOptions = validShutterTypes(catalogue, p.moduleCode, p.finishId);
  const update = (patch: Parameters<ReturnType<typeof projectStore.getState>["updatePlacement"]>[1]) =>
    projectStore.getState().updatePlacement(p.id, patch);
  const finish = catalogue.finishes.find((f) => f.id === p.finishId);

  return (
    <>
      <Section n={1} title="Unit" aside={<span className="text-[12px] text-mk-accent-ink">Selected</span>}>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="num rounded-md bg-mk-subtle px-2 py-1 text-[12.5px] font-semibold">{p.moduleCode}</span>
          <span className="min-w-0 truncate text-[16px] font-semibold">{mod.name}</span>
        </div>
        <Row label="Size">
          <span className="num">{size(p)} mm</span>
        </Row>
        <Row label="Wall">
          <InlineSelect
            label="Wall"
            className="w-[110px]"
            value={p.wallId}
            options={walls.map((w) => ({ value: w.id, label: `Wall ${w.id}` }))}
            onChange={(wallId) => wallId !== p.wallId && moveToWall(p, wallId)}
          />
        </Row>
        {!isFiller && (
          <Row label="Carcass">
            <InlineSelect
              label="Carcass"
              className="w-[150px]"
              value={p.carcassId}
              options={catalogue.carcasses.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(carcassId) => update({ carcassId })}
            />
          </Row>
        )}
        {mod.hasBlindSide && (
          <Row label="Blind side">
            <span className="inline-flex rounded-lg bg-mk-subtle p-0.5" role="radiogroup" aria-label="Blind side">
              {(["left", "right"] as BlindSide[]).map((side) => (
                <button
                  key={side}
                  type="button"
                  role="radio"
                  aria-checked={p.blindSide === side}
                  onClick={() => p.blindSide !== side && update({ blindSide: side })}
                  className={cn(
                    "h-[28px] rounded-md px-3 text-[12.5px] capitalize",
                    p.blindSide === side ? "bg-mk-panel font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-mk-ink-2",
                  )}
                >
                  {side}
                </button>
              ))}
            </span>
          </Row>
        )}
        <div className="mt-2 space-y-1 text-[12px] text-mk-muted">
          {!isFiller && (
            <div className="flex justify-between">
              <span>Carcass · {getCarcass(catalogue, p.carcassId).name}</span>
              <span className="num">{formatINR(line.carcassCost)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Shutters & finish</span>
            <span className="num">{formatINR(line.shutterCost)}</span>
          </div>
          {addOns > 0 && (
            <div className="flex justify-between">
              <span>Hardware add-ons</span>
              <span className="num">{formatINR(addOns)}</span>
            </div>
          )}
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-[14px] font-medium">Unit price</span>
          <span className="num text-[22px] font-semibold tracking-tight" data-unit-price>
            {formatINR(line.amount + addOns)}
          </span>
        </div>
      </Section>

      <Section n={2} title="Finish">
        {!isFiller && (
          <>
            <div className="mb-1.5 text-[12.5px] text-mk-muted">Shutter type</div>
            <InlineSelect
              label="Shutter type"
              value={p.shutterTypeId}
              options={shutterOptions.map((id) => ({ value: id, label: `${mod.fronts.drawers ? `${mod.fronts.drawers} drawers · ` : ""}${getShutterType(catalogue, id).name}` }))}
              onChange={(shutterTypeId) => update({ shutterTypeId })}
            />
          </>
        )}
        <div className="mt-3 flex gap-2.5" role="radiogroup" aria-label="Finish">
          {catalogue.finishes.map((f) => {
            const active = f.id === p.finishId;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={f.name}
                title={f.name}
                onClick={() => {
                  if (active) return;
                  // Keep the shutter valid for the new finish, in the same undo step.
                  const valid = validShutterTypes(catalogue, p.moduleCode, f.id);
                  update({ finishId: f.id, ...(valid.includes(p.shutterTypeId) ? {} : { shutterTypeId: valid[0] }) });
                }}
                className={cn("relative size-[46px] rounded-lg p-[3px] transition-shadow", active ? "ring-2 ring-mk-ink" : "ring-1 ring-mk-line hover:ring-mk-ink-2")}
              >
                <span
                  className="block size-full rounded-[6px] border border-black/5"
                  style={{
                    background:
                      f.id === "laminate-walnut"
                        ? `repeating-linear-gradient(100deg, ${f.hex} 0 5px, #8a6443 5px 7px, ${f.hex} 7px 11px)`
                        : f.hex,
                  }}
                />
                {active && <Check className="absolute top-1 right-1 size-3 text-white mix-blend-difference" />}
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-[13.5px] font-medium">{finish?.name}</div>
      </Section>

      <HardwareSection p={p} />

      <div className="px-5 py-4">
        <Button
          variant="outline"
          className="h-[38px] w-full gap-2 border-mk-line text-mk-bad hover:bg-mk-bad-soft hover:text-mk-bad"
          onClick={() => projectStore.getState().removePlacement(p.id)}
        >
          <Trash2 className="size-4" /> Delete unit
        </Button>
      </div>
    </>
  );
}

function ApplianceInspector({ a }: { a: AppliancePlacement }) {
  const spec = getAppliance(catalogue, a.applianceId);
  const host = useProjectStore((s) => (a.kind === "hosted" ? s.project.modules.find((m) => m.id === a.hostPlacementId) : undefined));
  const own = a.suppliedBy === "customer";
  const price = appliancePrice(a, catalogue);
  const cutOut = cutOutPrice(a, catalogue);
  const options = [
    { value: "makwana", label: "Makwana" },
    { value: "customer", label: "Customer's own" },
  ] as const;
  return (
    <>
      <Section n={1} title="Appliance" aside={<span className="text-[12px] text-mk-accent-ink">Selected</span>}>
        <div className="mb-3 text-[16px] font-semibold">{spec.name}</div>
        <Row label="Size">
          <span className="num">
            {spec.widthMm} × {spec.heightMm} × {spec.depthMm} mm
          </span>
        </Row>
        {spec.cutOut && (
          <Row label="Cut-out">
            <span className="num">
              {spec.cutOut.widthMm} × {spec.cutOut.depthMm} mm
            </span>
          </Row>
        )}
        {a.kind === "hosted" ? (
          <Row label="Fitted in">
            {host ? (
              <button
                type="button"
                className="font-medium text-mk-accent-ink hover:underline"
                onClick={() => projectStore.getState().select(host.id)}
                data-host-link
              >
                <span className="num">{host.moduleCode}</span> · Wall {host.wallId}
              </button>
            ) : (
              <span className="text-mk-bad">No unit</span>
            )}
          </Row>
        ) : (
          <Row label="Wall">
            <span className="num">
              Wall {a.wallId} · {a.offsetMm} mm
            </span>
          </Row>
        )}
      </Section>

      <Section n={2} title="Supply">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-mk-muted">Supplied by</span>
          <span className="inline-flex rounded-lg bg-mk-subtle p-0.5" role="radiogroup" aria-label="Supplied by">
            {options.map((o) => {
              const active = (a.suppliedBy ?? "makwana") === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => projectStore.getState().setSuppliedBy(a.id, o.value)}
                  className={cn("h-7 rounded-md px-2.5 text-[12.5px]", active ? "bg-mk-panel font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-mk-ink-2 hover:text-mk-ink")}
                >
                  {o.label}
                </button>
              );
            })}
          </span>
        </div>
        <div className="mt-3 space-y-1 text-[12.5px]">
          <div className="flex justify-between text-mk-muted">
            <span>{spec.name}</span>
            <span className="num">{own ? "Customer's own · ₹0" : formatINR(spec.price)}</span>
          </div>
          {cutOut > 0 && (
            <div className="flex justify-between text-mk-muted">
              <span>Countertop cut-out</span>
              <span className="num">{formatINR(cutOut)}</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-[14px] font-medium">Price</span>
          <span className="num text-[22px] font-semibold tracking-tight" data-appliance-price>
            {formatINR(price + cutOut)}
          </span>
        </div>
      </Section>

      <div className="px-5 py-4">
        <Button
          variant="outline"
          className="h-[38px] w-full gap-2 border-mk-line text-mk-bad hover:bg-mk-bad-soft hover:text-mk-bad"
          onClick={() => projectStore.getState().removeAppliance(a.id)}
        >
          <Trash2 className="size-4" /> Remove {spec.name.toLowerCase()}
        </Button>
      </div>
    </>
  );
}

export function Inspector() {
  const selectedId = useProjectStore((s) => s.ui.selectedPlacementId);
  const mod = useProjectStore((s) => s.project.modules.find((m) => m.id === selectedId));
  const app = useProjectStore((s) => s.project.appliances.find((a) => a.id === selectedId));

  return (
    <aside className="flex w-[336px] shrink-0 flex-col overflow-y-auto border-l border-mk-line bg-mk-panel" aria-label="Inspector">
      {mod ? (
        <ModuleInspector key={mod.id} p={mod} />
      ) : app ? (
        <ApplianceInspector a={app} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-mk-canvas text-mk-faint">
            <Grip className="size-5" />
          </span>
          <p className="text-[14px] font-medium text-mk-ink-2">Select a unit to edit it</p>
          <p className="text-[12.5px] text-mk-faint">Click a unit in the elevation, plan or 3D view, or drag a module onto a wall.</p>
        </div>
      )}
    </aside>
  );
}
