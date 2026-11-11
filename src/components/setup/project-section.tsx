"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { KitchenType } from "@/domain/types";
import { useProjectStore } from "@/store/project-store";

const KITCHEN_TYPES: { value: KitchenType; label: string }[] = [
  { value: "closed", label: "Closed kitchen" },
  { value: "open", label: "Open kitchen" },
  { value: "semi-open", label: "Semi-open" },
];

export function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-[11px] font-medium tracking-[0.16em] text-mk-faint uppercase">{children}</h2>
      {action}
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[12px] text-mk-muted">{children}</span>;
}

const inputClass =
  "h-[31px] w-full rounded-md border border-mk-line bg-mk-panel px-2.5 text-[13px] text-mk-ink outline-none transition-colors focus:border-mk-accent focus:ring-2 focus:ring-mk-accent/20";

/** Text field that writes to the store on blur, so typing is one undo step. */
function InfoInput({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <input
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      className={inputClass}
      onBlur={(e) => e.currentTarget.value !== value && onCommit(e.currentTarget.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function ProjectSection() {
  const customerName = useProjectStore((s) => s.project.customerName);
  const siteAddress = useProjectStore((s) => s.project.siteAddress);
  const kitchenType = useProjectStore((s) => s.project.kitchenType);
  const setInfo = useProjectStore((s) => s.setProjectInfo);

  return (
    <section>
      <SectionHeading>Project</SectionHeading>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <label>
          <FieldLabel>Customer name</FieldLabel>
          <InfoInput value={customerName} placeholder="Customer" onCommit={(v) => setInfo({ customerName: v })} />
        </label>
        <div>
          <FieldLabel>Kitchen type</FieldLabel>
          <Select items={KITCHEN_TYPES} value={kitchenType} onValueChange={(v) => setInfo({ kitchenType: v as KitchenType })}>
            <SelectTrigger aria-label="Kitchen type" className="h-[31px]! w-full rounded-md border-mk-line text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KITCHEN_TYPES.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="col-span-2">
          <FieldLabel>Site address</FieldLabel>
          <InfoInput value={siteAddress} placeholder="Site address" onCommit={(v) => setInfo({ siteAddress: v })} />
        </label>
      </div>
    </section>
  );
}
