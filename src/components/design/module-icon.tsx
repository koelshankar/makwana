import type { CatalogueModule } from "@/domain/types";

/** Small line drawing of a module's front: proportions, drawers, shutters, handles. */
export function ModuleIcon({ mod, className }: { mod: CatalogueModule; className?: string }) {
  const tall = mod.layer === "tall";
  const loft = mod.layer === "loft";
  const w = tall ? 20 : loft ? 34 : 32;
  const h = tall ? 36 : loft ? 16 : mod.layer === "wall" ? 26 : 28;
  const x = (44 - w) / 2;
  const y = (44 - h) / 2;
  const { shutters, drawers } = mod.fronts;
  const lines: React.ReactNode[] = [];
  if (drawers > 0) {
    for (let i = 1; i < drawers; i++) lines.push(<line key={`d${i}`} x1={x} x2={x + w} y1={y + (h * i) / drawers} y2={y + (h * i) / drawers} />);
    for (let i = 0; i < drawers; i++) lines.push(<line key={`h${i}`} x1={x + w * 0.4} x2={x + w * 0.6} y1={y + (h * i) / drawers + 3.5} y2={y + (h * i) / drawers + 3.5} />);
  } else if (tall) {
    const cuts = mod.hosts ? [0.3, 0.68] : [0.5];
    cuts.forEach((c, i) => lines.push(<line key={`t${i}`} x1={x} x2={x + w} y1={y + h * c} y2={y + h * c} />));
    if (mod.hosts) lines.push(<rect key="ov" x={x + 3} y={y + h * 0.3 + 3} width={w - 6} height={h * 0.38 - 6} />);
  } else if (mod.hasBlindSide) {
    lines.push(<line key="b" x1={x + w * 0.55} x2={x + w * 0.55} y1={y} y2={y + h} />);
    for (let i = 0; i < 5; i++) {
      const bx = x + w * 0.55 + i * 3.4;
      lines.push(<line key={`bh${i}`} x1={bx} x2={Math.min(x + w, bx + 6)} y1={y + h} y2={y + h - 6 - i * 4.5} strokeWidth={0.6} />);
    }
    lines.push(<line key="h" x1={x + w * 0.45} x2={x + w * 0.45} y1={y + 3} y2={y + 9} />);
  } else if (shutters === 2) {
    lines.push(<line key="m" x1={x + w / 2} x2={x + w / 2} y1={y} y2={y + h} />);
    const hy = mod.layer === "base" ? y + 3 : y + h - 9;
    if (!loft) lines.push(<line key="hl" x1={x + w / 2 - 3} x2={x + w / 2 - 3} y1={hy} y2={hy + 6} />, <line key="hr" x1={x + w / 2 + 3} x2={x + w / 2 + 3} y1={hy} y2={hy + 6} />);
  } else if (shutters === 1 && !loft) {
    const hy = mod.layer === "base" ? y + 3 : y + h - 9;
    lines.push(<line key="h" x1={x + w - 4} x2={x + w - 4} y1={hy} y2={hy + 6} />);
  }
  return (
    <svg viewBox="0 0 44 44" className={className} fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden>
      <rect x={x} y={y} width={w} height={h} rx={0.5} />
      {mod.layer === "base" && <line x1={x + 2} x2={x + w - 2} y1={y + h + 2.5} y2={y + h + 2.5} strokeWidth={0.8} />}
      {lines}
    </svg>
  );
}
